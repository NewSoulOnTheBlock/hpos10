import { Prisma, type PrismaClient } from '@hpos-pad/db'
import { lifeStateOf, soldBps, type LifeRules, type LifeState } from '@hpos-pad/shared'
import type { Redis } from 'ioredis'
import type pino from 'pino'

/**
 * Life watch: keeps each token's peaks and creator flow up to date, then
 * decides ALIVE / DEAD / RUGGED with the pure rules in packages/shared
 * vitals.ts. Runs on the leader every few minutes; everything it reads is
 * already in Postgres (trades, rollups, holder syncs) plus the cached quote
 * USD price. A RUGGED token stays rugged.
 */
export async function watchVitals(prisma: PrismaClient, redis: Redis, rules: LifeRules, quoteDecimals: number, logger: pino.Logger): Promise<void> {
  // Peaks only ever go up.
  await prisma.$executeRaw`
    UPDATE "Token" SET
      "peakVolume24hQuote" = GREATEST("peakVolume24hQuote", "volume24hQuote"),
      "peakHolders" = GREATEST("peakHolders", "holders")`

  // What each creator bought and sold of their own token, in one pass.
  const flows = await prisma.$queryRaw<{ mint: string; side: 'BUY' | 'SELL'; base: Prisma.Decimal }[]>`
    SELECT t.mint, tr.side, SUM(tr."baseAmount") AS base
    FROM "Trade" tr JOIN "Token" t ON t.mint = tr.mint AND t.creator = tr.trader
    GROUP BY t.mint, tr.side`
  const flow = new Map<string, { bought: bigint; sold: bigint }>()
  for (const f of flows) {
    const e = flow.get(f.mint) ?? { bought: 0n, sold: 0n }
    const v = BigInt(f.base.toFixed(0))
    if (f.side === 'BUY') e.bought = v
    else e.sold = v
    flow.set(f.mint, e)
  }

  const usd = Number(await redis.get('quote:usd')) || null
  const scale = 10 ** quoteDecimals
  const now = Date.now()
  const tokens = await prisma.token.findMany({
    select: { mint: true, status: true, createdAt: true, lastTradeAt: true, marketCapQuote: true, athMarketCapQuote: true, peakHolders: true, peakVolume24hQuote: true, lifeState: true },
  })
  let changed = 0
  for (const t of tokens) {
    const f = flow.get(t.mint) ?? { bought: 0n, sold: 0n }
    const state: LifeState = lifeStateOf(
      {
        previous: t.lifeState,
        migrated: t.status === 'MIGRATED',
        creatorSoldBps: soldBps(f.bought, f.sold),
        peakHolders: t.peakHolders,
        peakVolumeUsd: usd === null ? null : (Number(t.peakVolume24hQuote.toFixed(0)) / scale) * usd,
        idleHours: (now - (t.lastTradeAt ?? t.createdAt).getTime()) / 3_600_000,
        marketCapQuote: t.marketCapQuote,
        athMarketCapQuote: t.athMarketCapQuote,
      },
      rules,
    )
    const data: Prisma.TokenUpdateInput = { creatorBoughtBase: new Prisma.Decimal(f.bought.toString()), creatorSoldBase: new Prisma.Decimal(f.sold.toString()) }
    if (state !== t.lifeState) {
      data.lifeState = state
      data.lifeStateAt = new Date()
      changed++
      logger.info({ mint: t.mint, from: t.lifeState, to: state }, 'life state changed')
    }
    await prisma.token.update({ where: { mint: t.mint }, data })
  }
  if (changed) logger.info({ changed }, 'vitals updated')
}
