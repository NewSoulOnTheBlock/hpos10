import { Router } from 'express'
import { Keypair, PublicKey } from '@solana/web3.js'
import { openSecret, releaseVanityMint, reserveVanityMint, retireVanityMint } from '@hpos-pad/db'
import type { BuiltTransaction, MetadataUploadResponse } from '@hpos-pad/shared'
import { z } from 'zod'
import type { Ctx } from '../context.js'
import { HttpError } from '../middleware/errors.js'
import { txLimiter, uploadLimiter } from '../middleware/rate-limit.js'

const pubkey = z.string().transform((s, c) => {
  try {
    return new PublicKey(s)
  } catch {
    c.addIssue({ code: z.ZodIssueCode.custom, message: 'not a Solana address' })
    return z.NEVER
  }
})
/** Metaplex limits: name 32 bytes, symbol 10 bytes, uri 200 bytes. */
const bytesMax = (n: number) => (s: string) => Buffer.byteLength(s, 'utf8') <= n
const name = z.string().trim().min(1).refine(bytesMax(32), 'name is at most 32 bytes')
const symbol = z
  .string()
  .trim()
  .transform((s) => s.replace(/^\$/, '').toUpperCase())
  .pipe(z.string().min(1).refine(bytesMax(10), 'symbol is at most 10 bytes').refine((s) => /^[A-Z0-9]+$/.test(s), 'symbol is letters and digits only'))
const url = z
  .string()
  .trim()
  .max(200)
  .refine((s) => /^https:\/\//i.test(s), 'must be an https:// link')
  .optional()
  .or(z.literal('').transform(() => undefined))
const amount = z.string().regex(/^\d*\.?\d+$/, 'amount must be a positive decimal')
const payWith = z.enum(['SOL', 'QUOTE'])
const slippageBps = z.coerce.number().int().min(10).max(5_000).default(300)

export function writeRouter(ctx: Ctx): Router {
  const r = Router()

  r.post('/launch/metadata', uploadLimiter, async (req, res) => {
    const b = z
      .object({
        name,
        symbol,
        description: z.string().trim().max(1_000).optional(),
        website: url,
        twitter: url,
        telegram: url,
        image: z.string().max(6_000_000),
      })
      .parse(req.body)
    const { url: imageUrl, mime } = await ctx.ipfs.pinImage(b.image)
    const uri = await ctx.ipfs.pinJson({
      name: b.name,
      symbol: b.symbol,
      description: b.description ?? '',
      image: imageUrl,
      ...(b.website ? { external_url: b.website } : {}),
      extensions: { ...(b.website ? { website: b.website } : {}), ...(b.twitter ? { twitter: b.twitter } : {}), ...(b.telegram ? { telegram: b.telegram } : {}) },
      properties: { files: [{ uri: imageUrl, type: mime }], category: 'image' },
    })
    if (Buffer.byteLength(uri) > 200) throw new HttpError(500, 'metadata uri exceeds 200 bytes; shorten IPFS_GATEWAY')
    const body: MetadataUploadResponse = { uri, imageUrl }
    res.json(body)
  })

  r.post('/launch/build', txLimiter, async (req, res) => {
    const b = z
      .object({
        creator: pubkey,
        mint: pubkey.optional(),
        name,
        symbol,
        uri: z.string().url().refine(bytesMax(200), 'uri is at most 200 bytes'),
        description: z.string().trim().max(1_000).optional(),
        website: url,
        twitter: url,
        telegram: url,
        imageUrl: z.string().url().max(500).optional(),
        firstBuy: z.object({ amount, payWith, slippageBps }).optional(),
      })
      .parse(req.body)

    // No mint from the client: take a vanity mint (…hpos) from the pool, or a
    // fresh random one if the pool is empty/unconfigured. Either way the
    // server signs for it and the wallet only signs as payer.
    let mint = b.mint
    let mintSigner: Keypair | undefined
    let vanity: string | null = null
    if (!mint) {
      if (ctx.env.VANITY_ENCRYPTION_KEY) {
        for (let i = 0; i < 5 && !mintSigner; i++) {
          const v = await reserveVanityMint(ctx.prisma, b.creator.toBase58())
          if (!v) break
          const kp = Keypair.fromSecretKey(openSecret(v.secret, ctx.env.VANITY_ENCRYPTION_KEY))
          if (await ctx.chain.accountExists(kp.publicKey)) {
            await retireVanityMint(ctx.prisma, v.pubkey)
            continue
          }
          mintSigner = kp
          vanity = v.pubkey
        }
      }
      mintSigner ??= Keypair.generate()
      mint = mintSigner.publicKey
    }

    let built: BuiltTransaction
    try {
      built = await ctx.chain.buildLaunch({ creator: b.creator, mint, mintSigner, name: b.name, symbol: b.symbol, uri: b.uri, firstBuy: b.firstBuy })
    } catch (err) {
      // Nothing signed left the server: the vanity address goes back to the pool.
      if (vanity) await releaseVanityMint(ctx.prisma, vanity)
      throw err
    }
    // Socials/description for the indexer to attach when the pool lands.
    const draft = {
      creator: b.creator.toBase58(),
      name: b.name,
      symbol: b.symbol,
      uri: b.uri,
      description: b.description ?? null,
      imageUrl: b.imageUrl ?? null,
      website: b.website ?? null,
      twitter: b.twitter ?? null,
      telegram: b.telegram ?? null,
    }
    await ctx.prisma.launchDraft.upsert({ where: { mint: mint.toBase58() }, update: draft, create: { mint: mint.toBase58(), ...draft } })
    res.json({ ...built, mint: mint.toBase58(), mintSigned: !!mintSigner })
  })

  const tradeQuery = z.object({ mint: pubkey, side: z.enum(['BUY', 'SELL']), amount, payWith, slippageBps })

  const tokenRef = async (mint: PublicKey) => {
    const t = await ctx.prisma.token.findUnique({ where: { mint: mint.toBase58() }, select: { mint: true, pool: true, status: true, hidden: true } })
    if (!t || t.hidden) throw new HttpError(404, 'token not found')
    return t
  }

  r.get('/trade/quote', txLimiter, async (req, res) => {
    const q = tradeQuery.parse(req.query)
    const plan = await ctx.chain.planTrade(await tokenRef(q.mint), q.side, q.amount, q.payWith, q.slippageBps)
    res.json(plan.quote)
  })

  r.post('/trade/build', txLimiter, async (req, res) => {
    const b = tradeQuery.extend({ owner: pubkey }).parse(req.body)
    res.json(await ctx.chain.buildTrade(await tokenRef(b.mint), b.owner, b.side, b.amount, b.payWith, b.slippageBps))
  })

  return r
}
