import { Router } from 'express'
import { PublicKey } from '@solana/web3.js'
import { deriveDammV2PoolAuthority, deriveDbcPoolAuthority } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { type Prisma, toEpochDTO, toPayoutDTO, toTokenDTO, toTradeDTO } from '@hpos-pad/db'
import {
  TIMEFRAMES,
  TOKEN_DECIMALS,
  TOKEN_SORTS,
  TOKEN_STATUSES,
  TOKEN_TOTAL_SUPPLY,
  feeSplit,
  toUi,
  type CandleDTO,
  type HolderDTO,
  type LaunchpadConfigDTO,
  type PlatformStatsDTO,
  type WalletEarningsResponse,
  type WalletReflectionsResponse,
} from '@hpos-pad/shared'
import { z } from 'zod'
import { type Ctx, decimalsOf, quoteUsd } from '../context.js'
import { HttpError } from '../middleware/errors.js'

const address = z.string().refine((s) => {
  try {
    return new PublicKey(s).toBase58() === s
  } catch {
    return false
  }
}, 'not a Solana address')
/** Opaque offset cursor. */
const cursor = z
  .string()
  .regex(/^\d+$/)
  .optional()
  .transform((c) => (c ? Number(c) : 0))
const page = (items: unknown[], limit: number, offset: number) => (items.length > limit ? String(offset + limit) : null)
const raw = (d: { toFixed: (dp?: number) => string }) => BigInt(d.toFixed(0))

export function readRouter(ctx: Ctx): Router {
  const r = Router()
  const dec = decimalsOf(ctx)
  const split = feeSplit({ tradeFeeBps: ctx.env.TRADE_FEE_BPS, reflectionBps: ctx.env.REFLECTION_BPS, creatorBps: ctx.env.CREATOR_BPS })

  r.get('/config', (_req, res) => {
    const body: LaunchpadConfigDTO = {
      cluster: ctx.env.CLUSTER,
      dbcConfig: ctx.env.DBC_CONFIG,
      quote: { mint: ctx.env.QUOTE_MINT, symbol: ctx.env.QUOTE_SYMBOL, decimals: ctx.env.QUOTE_DECIMALS, ...ctx.quoteMeta },
      fees: { tradeFeeBps: split.tradeFeeBps, protocolBps: split.protocolBps, reflectionBps: split.reflectionBps, creatorBps: split.creatorBps, platformBps: split.platformBps },
      curve: { migrationQuoteThreshold: toUi(BigInt(ctx.chain.poolConfig.migrationQuoteThreshold.toString()), ctx.env.QUOTE_DECIMALS) },
      token: { decimals: TOKEN_DECIMALS, totalSupply: TOKEN_TOTAL_SUPPLY },
      treasury: ctx.env.TREASURY,
      feeClaimer: ctx.env.FEE_CLAIMER,
      featuredMints: ctx.env.FEATURED_MINTS.split(',').map((m) => m.trim()).filter(Boolean),
      officialMint: ctx.env.OFFICIAL_MINT ?? null,
    }
    res.set('Cache-Control', 'public, max-age=60').json(body)
  })

  r.get('/stats', async (_req, res) => {
    const [tokens, graduated, agg] = await Promise.all([
      ctx.prisma.token.count({ where: { hidden: false } }),
      ctx.prisma.token.count({ where: { hidden: false, status: 'MIGRATED' } }),
      ctx.prisma.token.aggregate({ where: { hidden: false }, _sum: { volume24hQuote: true, reflectedTotalQuote: true, creatorEarnedQuote: true } }),
    ])
    const body: PlatformStatsDTO = {
      tokens,
      graduated,
      volume24hQuote: toUi(agg._sum.volume24hQuote ? raw(agg._sum.volume24hQuote) : 0n, dec.quote),
      reflectedTotalQuote: toUi(agg._sum.reflectedTotalQuote ? raw(agg._sum.reflectedTotalQuote) : 0n, dec.quote),
      creatorEarnedTotalQuote: toUi(agg._sum.creatorEarnedQuote ? raw(agg._sum.creatorEarnedQuote) : 0n, dec.quote),
      quoteUsd: await quoteUsd(ctx),
    }
    res.set('Cache-Control', 'public, max-age=10').json(body)
  })

  r.get('/tokens', async (req, res) => {
    const q = z
      .object({
        sort: z.enum(TOKEN_SORTS).default('new'),
        status: z.enum(TOKEN_STATUSES).optional(),
        q: z.string().trim().max(64).optional(),
        creator: address.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
        cursor,
      })
      .parse(req.query)

    const where: Prisma.TokenWhereInput = { hidden: false }
    if (q.status) where.status = q.status
    if (q.creator) where.creator = q.creator
    if (q.q) {
      where.OR = [
        { mint: q.q },
        { name: { contains: q.q, mode: 'insensitive' } },
        { symbol: { contains: q.q.replace(/^\$/, ''), mode: 'insensitive' } },
      ]
    }
    // All pools share one config, so quote reserve orders by curve progress.
    if (q.sort === 'progress') where.status = q.status ?? 'CURVE'
    const orderBy: Prisma.TokenOrderByWithRelationInput[] = {
      new: [{ createdAt: 'desc' as const }],
      volume: [{ volume24hQuote: 'desc' as const }, { createdAt: 'desc' as const }],
      mcap: [{ marketCapQuote: 'desc' as const }],
      progress: [{ quoteReserve: 'desc' as const }],
      lastTrade: [{ lastTradeAt: { sort: 'desc' as const, nulls: 'last' as const } }],
    }[q.sort]

    const rows = await ctx.prisma.token.findMany({ where, orderBy, skip: q.cursor, take: q.limit + 1 })
    const usd = await quoteUsd(ctx)
    res.json({ items: rows.slice(0, q.limit).map((t) => toTokenDTO(t, dec, usd)), nextCursor: page(rows, q.limit, q.cursor) })
  })

  const tokenOr404 = async (mint: string) => {
    const t = await ctx.prisma.token.findUnique({ where: { mint } })
    if (!t || t.hidden) throw new HttpError(404, 'token not found')
    return t
  }

  r.get('/tokens/:mint', async (req, res) => {
    const t = await tokenOr404(address.parse(req.params.mint))
    res.json(toTokenDTO(t, dec, await quoteUsd(ctx)))
  })

  r.get('/tokens/:mint/trades', async (req, res) => {
    const mint = address.parse(req.params.mint)
    const q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor }).parse(req.query)
    const t = await tokenOr404(mint)
    const rows = await ctx.prisma.trade.findMany({ where: { mint }, orderBy: [{ blockTime: 'desc' }, { id: 'desc' }], skip: q.cursor, take: q.limit + 1 })
    const usd = await quoteUsd(ctx)
    res.json({ items: rows.slice(0, q.limit).map((tr) => toTradeDTO(tr, t, dec, usd)), nextCursor: page(rows, q.limit, q.cursor) })
  })

  r.get('/tokens/:mint/candles', async (req, res) => {
    const mint = address.parse(req.params.mint)
    const q = z
      .object({
        tf: z.enum(TIMEFRAMES).default('5m'),
        from: z.coerce.number().int().optional(),
        to: z.coerce.number().int().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(500),
      })
      .parse(req.query)
    const rows = await ctx.prisma.candle.findMany({
      where: {
        mint,
        timeframe: q.tf,
        bucket: { ...(q.from ? { gte: new Date(q.from * 1000) } : {}), ...(q.to ? { lte: new Date(q.to * 1000) } : {}) },
      },
      orderBy: { bucket: 'desc' },
      take: q.limit,
    })
    const items: CandleDTO[] = rows.reverse().map((c) => ({
      time: Math.floor(c.bucket.getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volumeQuote: Number(toUi(raw(c.volumeQuote), dec.quote)),
    }))
    res.json({ timeframe: q.tf, items })
  })

  r.get('/tokens/:mint/holders', async (req, res) => {
    const mint = address.parse(req.params.mint)
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query)
    const t = await tokenOr404(mint)
    const rows = await ctx.prisma.holder.findMany({ where: { mint }, orderBy: { amount: 'desc' }, take: limit })
    const supply = BigInt(TOKEN_TOTAL_SUPPLY) * 10n ** BigInt(TOKEN_DECIMALS)
    const labels = new Map<string, string>([
      [deriveDbcPoolAuthority().toBase58(), 'Bonding curve'],
      [deriveDammV2PoolAuthority().toBase58(), 'Graduated pool'],
      [ctx.env.FEE_CLAIMER, 'Platform'],
      [ctx.env.TREASURY, 'Treasury'],
      [t.creator, 'Creator'],
    ])
    const items: HolderDTO[] = rows.map((h) => ({
      owner: h.owner,
      amount: toUi(raw(h.amount), TOKEN_DECIMALS),
      share: Number((raw(h.amount) * 1_000_000n) / supply) / 1_000_000,
      label: labels.get(h.owner) ?? null,
    }))
    res.json(items)
  })

  r.get('/tokens/:mint/reflections', async (req, res) => {
    const mint = address.parse(req.params.mint)
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), cursor }).parse(req.query)
    await tokenOr404(mint)
    const rows = await ctx.prisma.reflectionEpoch.findMany({ where: { mint }, orderBy: { createdAt: 'desc' }, skip: q.cursor, take: q.limit + 1 })
    res.json({ items: rows.slice(0, q.limit).map((e) => toEpochDTO(e, dec.quote)), nextCursor: page(rows, q.limit, q.cursor) })
  })

  r.get('/trades/recent', async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query)
    const rows = await ctx.prisma.trade.findMany({
      where: { token: { hidden: false } },
      orderBy: [{ blockTime: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { token: { select: { symbol: true, imageUrl: true } } },
    })
    const usd = await quoteUsd(ctx)
    res.json(rows.map((tr) => toTradeDTO(tr, tr.token, dec, usd)))
  })

  r.get('/wallets/:address/reflections', async (req, res) => {
    const owner = address.parse(req.params.address)
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), cursor }).parse(req.query)
    // Everything credited in completed epochs: pushed (signature set) or accrued to claim.
    const where: Prisma.ReflectionPayoutWhereInput = { owner, epoch: { status: 'DONE' } }
    const [rows, total] = await Promise.all([
      ctx.prisma.reflectionPayout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.cursor,
        take: q.limit + 1,
        include: { epoch: { select: { token: { select: { symbol: true } } } } },
      }),
      ctx.prisma.reflectionPayout.aggregate({ where, _sum: { amount: true } }),
    ])
    const body: WalletReflectionsResponse = {
      items: rows.slice(0, q.limit).map((p) => toPayoutDTO(p, p.epoch.token.symbol, dec.quote)),
      nextCursor: page(rows, q.limit, q.cursor),
      totalQuote: toUi(total._sum.amount ? raw(total._sum.amount) : 0n, dec.quote),
    }
    res.json(body)
  })

  r.get('/wallets/:address/earnings', async (req, res) => {
    const owner = address.parse(req.params.address)
    const { mint } = z.object({ mint: address.optional() }).parse(req.query)
    // Same rule as the payout list: everything credited in completed epochs.
    const grouped = await ctx.prisma.reflectionPayout.groupBy({
      by: ['mint'],
      where: { owner, epoch: { status: 'DONE' }, ...(mint ? { mint } : {}) },
      _sum: { amount: true },
      _count: { _all: true },
      _max: { createdAt: true },
    })
    const tokens = await ctx.prisma.token.findMany({
      where: { mint: { in: grouped.map((g) => g.mint) } },
      select: { mint: true, symbol: true, name: true, imageUrl: true },
    })
    const meta = new Map(tokens.map((t) => [t.mint, t]))
    let total = 0n
    const rows = grouped
      .map((g) => {
        const amount = g._sum.amount ? raw(g._sum.amount) : 0n
        total += amount
        const t = meta.get(g.mint)
        return {
          amount,
          dto: {
            mint: g.mint,
            symbol: t?.symbol ?? '???',
            name: t?.name ?? 'Unknown',
            imageUrl: t?.imageUrl ?? null,
            totalQuote: toUi(amount, dec.quote),
            payouts: g._count._all,
            lastPaidAt: g._max.createdAt?.toISOString() ?? null,
          },
        }
      })
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
    // Creator share for tokens this wallet launched.
    const createdTokens = await ctx.prisma.token.findMany({
      where: { creator: owner, creatorEarnedQuote: { gt: 0 }, ...(mint ? { mint } : {}) },
      select: { mint: true, symbol: true, name: true, imageUrl: true, creatorEarnedQuote: true },
      orderBy: { creatorEarnedQuote: 'desc' },
    })
    const creatorTotal = createdTokens.reduce((a, t) => a + raw(t.creatorEarnedQuote), 0n)
    const body: WalletEarningsResponse = {
      totalQuote: toUi(total, dec.quote),
      tokens: rows.map((r) => r.dto),
      creatorTotalQuote: toUi(creatorTotal, dec.quote),
      created: createdTokens.map((t) => ({ mint: t.mint, symbol: t.symbol, name: t.name, imageUrl: t.imageUrl, totalQuote: toUi(raw(t.creatorEarnedQuote), dec.quote) })),
    }
    res.json(body)
  })

  r.get('/wallets/:address/trades', async (req, res) => {
    const trader = address.parse(req.params.address)
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), cursor }).parse(req.query)
    const rows = await ctx.prisma.trade.findMany({
      where: { trader },
      orderBy: [{ blockTime: 'desc' }, { id: 'desc' }],
      skip: q.cursor,
      take: q.limit + 1,
      include: { token: { select: { symbol: true, imageUrl: true } } },
    })
    const usd = await quoteUsd(ctx)
    res.json({ items: rows.slice(0, q.limit).map((tr) => toTradeDTO(tr, tr.token, dec, usd)), nextCursor: page(rows, q.limit, q.cursor) })
  })

  return r
}
