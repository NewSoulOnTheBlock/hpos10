import { createServer } from 'node:http'
import { createPrisma } from '@hpos-pad/db'
import { createApp } from './app.js'
import { createRedisClients } from './clients/redis.js'
import { loadEnv } from './config/env.js'
import type { Ctx } from './context.js'
import { createLogger } from './infra/logger.js'
import { Chain } from './services/chain.js'
import { Ipfs } from './services/ipfs.js'
import { ClaimSettler } from './services/claims.js'
import { PublicKey } from '@solana/web3.js'
import { attachWsBridge } from './ws/bridge.js'

const env = loadEnv()
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development')

async function quoteMeta(mint: string): Promise<Ctx['quoteMeta']> {
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`, { signal: AbortSignal.timeout(5_000) })
    const rows = (await res.json()) as { id: string; name: string; icon?: string }[]
    const t = rows.find((r) => r.id === mint)
    if (t) return { name: t.name, logoUrl: t.icon ?? null }
  } catch {
    // Cosmetic only.
  }
  return { name: env.QUOTE_SYMBOL, logoUrl: null }
}

async function main(): Promise<void> {
  const prisma = createPrisma(env.DATABASE_URL)
  const redis = createRedisClients(env.REDIS_URL, logger)
  await Promise.all([prisma.$connect(), redis.cmd.connect(), redis.sub.connect()])
  const chain = new Chain(env)
  await chain.init()

  const claims = new ClaimSettler(prisma, env.RPC_URL, new PublicKey(env.QUOTE_MINT), logger)
  claims.startReconciler()
  const ctx: Ctx = { env, prisma, redis, chain, ipfs: new Ipfs(env.PINATA_JWT, env.IPFS_GATEWAY), claims, logger, quoteMeta: await quoteMeta(env.QUOTE_MINT) }
  const server = createServer(createApp(ctx))
  const closeWs = attachWsBridge(server, redis.sub, logger)
  server.listen(env.PORT, () => logger.info({ port: env.PORT, config: env.DBC_CONFIG }, 'api listening'))

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    server.close()
    await closeWs()
    await prisma.$disconnect()
    redis.cmd.disconnect()
    redis.sub.disconnect()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.fatal({ err: (err as Error).message }, 'api failed to start')
  process.exit(1)
})
