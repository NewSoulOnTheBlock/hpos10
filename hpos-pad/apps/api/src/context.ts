import type { PrismaClient } from '@hpos-pad/db'
import type pino from 'pino'
import type { RedisClients } from './clients/redis.js'
import type { Env } from './config/env.js'
import type { Ipfs } from './services/ipfs.js'
import type { ClaimSettler } from './services/claims.js'

/** The subset of Chain the routes use; tests substitute a fake. */
export type ChainPort = Pick<import('./services/chain.js').Chain, 'planTrade' | 'buildTrade' | 'buildLaunch' | 'accountExists'> & {
  poolConfig: { migrationQuoteThreshold: { toString(): string } }
}

export type Ctx = {
  env: Env
  prisma: PrismaClient
  redis: RedisClients
  chain: ChainPort
  ipfs: Ipfs
  claims: ClaimSettler
  logger: pino.Logger
  quoteMeta: { name: string; logoUrl: string | null }
}

export async function quoteUsd(ctx: Ctx): Promise<number | null> {
  const v = await ctx.redis.cmd.get('quote:usd').catch(() => null)
  if (v) return Number(v)
  const kv = await ctx.prisma.keyValue.findUnique({ where: { key: 'quote:usd' } })
  return kv ? Number(kv.value) : null
}

export const decimalsOf = (ctx: Ctx) => ({ base: 6, quote: ctx.env.QUOTE_DECIMALS })
