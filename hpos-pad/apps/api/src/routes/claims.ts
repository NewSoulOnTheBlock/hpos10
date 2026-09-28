import { Router } from 'express'
import { PublicKey } from '@solana/web3.js'
import { claimableFor, Prisma } from '@hpos-pad/db'
import { toUi, type ClaimableDTO, type ClaimBuildResponse } from '@hpos-pad/shared'
import { z } from 'zod'
import type { Ctx } from '../context.js'
import { HttpError } from '../middleware/errors.js'
import { txLimiter } from '../middleware/rate-limit.js'

const owner = z.string().refine((s) => {
  try {
    return PublicKey.isOnCurve(new PublicKey(s).toBytes())
  } catch {
    return false
  }
}, 'not a wallet address')
/** Below this a claim costs more in fees than it pays out. */
const MIN_CLAIM_RAW = 10_000n // 0.01 of a 6-decimal quote

export function claimsRouter(ctx: Ctx): Router {
  const r = Router()
  const dec = ctx.env.QUOTE_DECIMALS

  const view = async (address: string): Promise<ClaimableDTO> => {
    await ctx.claims.settleOwner(address)
    const { accrued, claimable } = await claimableFor(ctx.prisma, address)
    const [landed, pending] = await Promise.all([
      ctx.prisma.claim.aggregate({ where: { owner: address, status: 'LANDED' }, _sum: { amount: true } }),
      ctx.prisma.claim.findFirst({ where: { owner: address, status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
    ])
    return {
      claimableQuote: toUi(claimable, dec),
      accruedQuote: toUi(accrued, dec),
      claimedQuote: toUi(landed._sum.amount ? BigInt(landed._sum.amount.toFixed(0)) : 0n, dec),
      pending: pending ? { id: pending.id, amountQuote: toUi(BigInt(pending.amount.toFixed(0)), dec) } : null,
      minClaimQuote: toUi(MIN_CLAIM_RAW, dec),
    }
  }

  r.get('/wallets/:address/claimable', async (req, res) => {
    res.json(await view(owner.parse(req.params.address)))
  })

  r.post('/claims/build', txLimiter, async (req, res) => {
    const { owner: who } = z.object({ owner }).parse(req.body)
    if (!ctx.env.SIGNER_TOKEN) throw new HttpError(503, 'claims are not enabled yet')
    await ctx.claims.settleOwner(who)

    // One claim at a time per wallet: the advisory lock serialises concurrent builds.
    const claim = await ctx.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${who}))`
      const open = await db.claim.findFirst({ where: { owner: who, status: 'PENDING' } })
      if (open) return open
      const { claimable } = await claimableFor(ctx.prisma, who)
      if (claimable < MIN_CLAIM_RAW) throw new HttpError(400, `nothing to claim yet (minimum ${toUi(MIN_CLAIM_RAW, dec)})`)
      return db.claim.create({ data: { owner: who, amount: new Prisma.Decimal(claimable.toString()), status: 'PENDING', lastValidBlockHeight: 0n } })
    })

    // An unexpired signed claim is returned again (a retry after closing the wallet popup).
    if (claim.transaction && claim.lastValidBlockHeight > 0n) {
      const body: ClaimBuildResponse = {
        claimId: claim.id,
        transaction: claim.transaction,
        lastValidBlockHeight: Number(claim.lastValidBlockHeight),
        amountQuote: toUi(BigInt(claim.amount.toFixed(0)), dec),
      }
      res.json(body)
      return
    }
    if (claim.lastValidBlockHeight > 0n) throw new HttpError(409, 'a claim is already in progress; try again in a minute')

    const signed = await fetch(`${ctx.env.SIGNER_URL}/claims/sign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signer-token': ctx.env.SIGNER_TOKEN },
      body: JSON.stringify({ claimId: claim.id }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null)
    const out = (await signed?.json().catch(() => null)) as { transaction?: string; lastValidBlockHeight?: number; error?: string } | null
    if (!signed?.ok || !out?.transaction) {
      // Never signed, so nothing can land: release the reservation now.
      await ctx.prisma.claim.updateMany({ where: { id: claim.id, status: 'PENDING', lastValidBlockHeight: 0n }, data: { status: 'EXPIRED', settledAt: new Date() } })
      throw new HttpError(503, `could not prepare the claim${out?.error ? `: ${out.error}` : ''}`)
    }
    const body: ClaimBuildResponse = {
      claimId: claim.id,
      transaction: out.transaction,
      lastValidBlockHeight: out.lastValidBlockHeight!,
      amountQuote: toUi(BigInt(claim.amount.toFixed(0)), dec),
    }
    res.json(body)
  })

  r.post('/claims/:id/confirm', txLimiter, async (req, res) => {
    const { signature } = z.object({ signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/) }).parse(req.body)
    const claim = await ctx.prisma.claim.findUnique({ where: { id: String(req.params.id) } })
    if (!claim) throw new HttpError(404, 'claim not found')
    if (claim.status !== 'PENDING') {
      res.json({ status: claim.status })
      return
    }
    const verdict = await ctx.claims.isClaimTx(claim, signature)
    if (verdict === 'no') throw new HttpError(400, 'that transaction is not this claim')
    if (verdict === 'unknown') {
      // Not visible yet; remember it so the reconciler checks this signature first.
      await ctx.prisma.claim.updateMany({ where: { id: claim.id, status: 'PENDING' }, data: { signature } })
      res.status(202).json({ status: 'PENDING' })
      return
    }
    await ctx.claims.markLanded(claim, signature)
    res.json({ status: 'LANDED' })
  })

  return r
}
