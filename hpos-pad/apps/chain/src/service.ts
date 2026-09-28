import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { createPrisma } from '@hpos-pad/db'
import { feeSplit } from '@hpos-pad/shared'
import { randomUUID } from 'node:crypto'
import { createRedis } from './clients/redis.js'
import { createSolana } from './clients/solana.js'
import { loadEnv, serviceEnvSchema } from './config/env.js'
import { createLogger } from './infra/logger.js'
import { Migrator } from './jobs/migrator.js'
import { refreshQuotePrice } from './jobs/quote-price.js'
import { Reflector } from './jobs/reflector.js'
import { rollups } from './jobs/rollups.js'
import { syncHolders } from './jobs/holders.js'
import { watchVitals } from './jobs/vitals.js'
import { startClaimSigner } from './jobs/claim-signer.js'
import { parseKeypair } from './lib/keys.js'
import { createSender } from './lib/tx.js'

/**
 * chain service: the jobs that spend money or roll data up.
 *
 *   quote price   every 60s
 *   rollups       every 60s   (24h volume / trades / change)
 *   migrator      every 30s   (graduate completed curves to DAMM v2)
 *   holders       every HOLDERS_SYNC_MINUTES
 *   reflector     every REFLECT_INTERVAL_MINUTES
 *
 * Only one replica may run the jobs that sign transactions. A Redis lease
 * elects the leader; followers stay idle and take over if it disappears.
 */
const env = loadEnv(serviceEnvSchema)
const logger = createLogger({ service: 'chain-service', level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' })
const prisma = createPrisma(env.DATABASE_URL)
const redis = createRedis(env.REDIS_URL, logger)
const solana = await createSolana(env)
const feeClaimer = parseKeypair(env.FEE_CLAIMER_SECRET_KEY)
const sender = createSender(solana.connection, env.PRIORITY_FEE_MICROLAMPORTS)
const split = feeSplit({ tradeFeeBps: env.TRADE_FEE_BPS, reflectionBps: env.REFLECTION_BPS, creatorBps: env.CREATOR_BPS })

const reflector = new Reflector({ prisma, redis, solana, sender, feeClaimer, treasury: new PublicKey(env.TREASURY), split, env, logger })
const migrator = new Migrator({ prisma, redis, solana, sender, feeClaimer, quoteDecimals: env.QUOTE_DECIMALS, logger })

const LEASE_KEY = 'service:leader'
const LEASE_MS = 30_000
const instance = randomUUID()
let leader = false

async function renewLease(): Promise<void> {
  // Acquire if free, extend if ours. Lua keeps check-and-set atomic.
  const ok = await redis.eval(
    `local v = redis.call('GET', KEYS[1])
     if (not v) or v == ARGV[1] then redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 1 end
     return 0`,
    1,
    LEASE_KEY,
    instance,
    String(LEASE_MS),
  )
  const was = leader
  leader = ok === 1
  if (leader !== was) logger.info({ leader }, leader ? 'became leader' : 'lost leadership')
}

/** Run `fn` every `ms`, never overlapping itself, only while leader. */
function every(name: string, ms: number, fn: () => Promise<unknown>, leaderOnly = true): void {
  let running = false
  const tick = async () => {
    if (running || (leaderOnly && !leader)) return
    running = true
    const started = Date.now()
    try {
      await fn()
      logger.debug({ job: name, ms: Date.now() - started }, 'job done')
    } catch (err) {
      logger.error({ job: name, err: (err as Error).message }, 'job failed')
    } finally {
      running = false
    }
  }
  setTimeout(tick, 2_000)
  setInterval(tick, ms)
}

async function main(): Promise<void> {
  await prisma.$connect()
  await redis.connect()
  const sol = (await solana.connection.getBalance(feeClaimer.publicKey)) / LAMPORTS_PER_SOL
  logger.info(
    {
      feeClaimer: feeClaimer.publicKey.toBase58(),
      treasury: env.TREASURY,
      sol,
      split: `${split.tradeFeeBps / 100}% = holders ${split.reflectionBps / 100}% + creator ${split.creatorBps / 100}% + platform ${split.platformBps / 100}% + Meteora ${split.protocolBps / 100}%`,
    },
    'chain-service starting',
  )
  if (sol < 0.05) logger.warn({ sol }, 'fee claimer is low on SOL; claims, payouts and migrations will fail')

  await renewLease()
  setInterval(() => void renewLease().catch((err) => logger.warn({ err: (err as Error).message }, 'lease renew failed')), LEASE_MS / 3)

  if (env.SIGNER_TOKEN) {
    startClaimSigner({ prisma, solana, feeClaimer, quoteDecimals: env.QUOTE_DECIMALS, priorityMicroLamports: env.PRIORITY_FEE_MICROLAMPORTS, logger }, env.SIGNER_PORT, env.SIGNER_TOKEN)
  } else {
    logger.warn('SIGNER_TOKEN unset: claims are disabled')
  }

  every('quote-price', 60_000, () => refreshQuotePrice(prisma, redis, env.QUOTE_MINT), false)
  every('rollups', 60_000, () => rollups(prisma))
  every('holders', env.HOLDERS_SYNC_MINUTES * 60_000, () => syncHolders(prisma, solana, logger))
  every('vitals', env.VITALS_MINUTES * 60_000, () =>
    watchVitals(
      prisma,
      redis,
      {
        creatorSoldBps: env.RUG_CREATOR_SOLD_BPS,
        minHolders: env.RUG_MIN_HOLDERS,
        minPeakVolumeUsd: env.RUG_MIN_PEAK_VOLUME_USD,
        rugIdleHours: env.RUG_IDLE_HOURS,
        athDrawdownBps: env.RUG_ATH_DRAWDOWN_BPS,
        deadIdleHours: env.DEAD_IDLE_HOURS,
      },
      env.QUOTE_DECIMALS,
      logger,
    ),
  )
  if (env.MIGRATOR_ENABLED) every('migrator', 30_000, () => migrator.run())
  if (env.REFLECT_ENABLED) every('reflector', env.REFLECT_INTERVAL_MINUTES * 60_000, () => reflector.run())
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down')
  if (leader) await redis.del(LEASE_KEY).catch(() => {})
  await prisma.$disconnect()
  redis.disconnect()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

main().catch((err) => {
  logger.fatal({ err: (err as Error).message }, 'service crashed')
  process.exit(1)
})
