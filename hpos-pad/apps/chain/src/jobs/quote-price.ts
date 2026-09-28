import type { PrismaClient } from '@hpos-pad/db'
import type { Redis } from 'ioredis'

/** Quote token USD price from Jupiter, shared through Redis (10 min TTL) and persisted. */
export async function refreshQuotePrice(prisma: PrismaClient, redis: Redis, quoteMint: string): Promise<number | null> {
  const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${quoteMint}`, { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) return null
  const body = (await res.json()) as Record<string, { usdPrice?: number }>
  const usd = body[quoteMint]?.usdPrice
  if (!usd || !Number.isFinite(usd)) return null
  await redis.set('quote:usd', String(usd), 'EX', 600)
  await prisma.keyValue.upsert({ where: { key: 'quote:usd' }, update: { value: String(usd) }, create: { key: 'quote:usd', value: String(usd) } })
  return usd
}
