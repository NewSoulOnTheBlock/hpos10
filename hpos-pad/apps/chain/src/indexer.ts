import { PublicKey } from '@solana/web3.js'
import { createPrisma } from '@hpos-pad/db'
import { createRedis } from './clients/redis.js'
import { createSolana } from './clients/solana.js'
import { indexerEnvSchema, loadEnv } from './config/env.js'
import { createLogger } from './infra/logger.js'
import { GrpcStream } from './ingestion/grpc.js'
import { fetchTx, normalizeRpcTx, signaturesSince } from './ingestion/rpc.js'
import type { NormalizedTx } from './ingestion/types.js'
import { Processor } from './processing/processor.js'

/**
 * chain indexer: every trade on every The Hatchery token, into Postgres.
 *
 *   ingestion  = cursor backfill (RPC) + live stream (Yellowstone gRPC, or
 *                RPC websocket logsSubscribe when GRPC_URL is unset)
 *   filter     = transactions touching the DBC config key (every pool
 *                launched on the pad passes it to every swap and init) and
 *                each graduated DAMM v2 pool
 *   decoding   = Anchor event CPI (EvtInitializePool, EvtSwap2,
 *                EvtCurveComplete; cp-amm EvtSwap2)
 *   writes     = idempotent on (signature, eventIndex), ordered by
 *                slot*1000+eventIndex, so live/backfill overlap and
 *                out-of-order arrival can never double count or rewind price
 *
 * The cursor only moves when the backfill has walked a contiguous range,
 * so a dropped websocket or a restart heals exactly the gap it left.
 */
const env = loadEnv(indexerEnvSchema)
const logger = createLogger({ service: 'chain-indexer', level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' })
const prisma = createPrisma(env.DATABASE_URL)
const redis = createRedis(env.REDIS_URL, logger)
const solana = await createSolana(env)

let grpc: GrpcStream | null = null
const logSubs = new Map<string, number>()

const processor = new Processor({
  prisma,
  redis,
  solana,
  logger,
  quoteDecimals: env.QUOTE_DECIMALS,
  onWatch: (address) => {
    if (grpc) grpc.watch(address)
    else subscribeLogs(address)
    void backfill(address)
  },
})

/* ---------------- one serial queue: ordering + no duplicate work ---------------- */

const recent = new Set<string>()
let queue: Promise<void> = Promise.resolve()
function enqueue(tx: NormalizedTx): Promise<void> {
  if (recent.has(tx.signature)) return queue
  recent.add(tx.signature)
  if (recent.size > 50_000) recent.delete(recent.values().next().value!)
  queue = queue
    .then(() => processor.handle(tx))
    .then(() => heartbeat(tx.slot))
    .catch((err: Error) => {
      // Forget it so the next backfill retries; the cursor has not moved past it.
      recent.delete(tx.signature)
      logger.error({ err: err.message, sig: tx.signature }, 'processing failed')
    })
  return queue
}

let lastSlot = 0
async function heartbeat(slot: number): Promise<void> {
  if (slot <= lastSlot) return
  lastSlot = slot
  await redis.set('indexer:heartbeat', JSON.stringify({ slot, at: Date.now() })).catch(() => {})
}

/* ---------------------------------- backfill ---------------------------------- */

const backfilling = new Set<string>()
async function backfill(address: string): Promise<void> {
  if (backfilling.has(address)) return
  backfilling.add(address)
  try {
    const cursor = await prisma.indexerCursor.findUnique({ where: { id: address } })
    const sigs = await signaturesSince(solana.connection, new PublicKey(address), cursor?.signature, env.BACKFILL_MAX_SIGNATURES)
    if (sigs.length === 0) return
    logger.info({ address, count: sigs.length, from: cursor ? 'cursor' : 'cold start' }, 'backfilling')

    for (let i = 0; i < sigs.length; i += 20) {
      const chunk = sigs.slice(i, i + 20)
      const txs = await Promise.all(chunk.map((s) => fetchTx(solana.connection, s.signature)))
      for (const raw of txs) {
        const tx = raw && normalizeRpcTx(raw)
        if (tx) await enqueue(tx)
      }
      const last = chunk[chunk.length - 1]!
      // Advance only after the whole chunk processed in order.
      await queue
      await prisma.indexerCursor.upsert({
        where: { id: address },
        update: { signature: last.signature, slot: BigInt(last.slot) },
        create: { id: address, signature: last.signature, slot: BigInt(last.slot) },
      })
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, address }, 'backfill failed; will retry next poll')
  } finally {
    backfilling.delete(address)
  }
}

/* ------------------------------------ live ------------------------------------ */

function subscribeLogs(address: string): void {
  if (logSubs.has(address)) return
  const id = solana.connection.onLogs(
    new PublicKey(address),
    (logs) => {
      if (logs.err) return
      void fetchTx(solana.connection, logs.signature).then((raw) => {
        const tx = raw && normalizeRpcTx(raw)
        if (tx) void enqueue(tx)
      })
    },
    'confirmed',
  )
  logSubs.set(address, id)
}

/* ------------------------------------ main ------------------------------------ */

async function main(): Promise<void> {
  await prisma.$connect()
  await redis.connect()
  await processor.init()
  const addresses = processor.watchedAddresses()
  logger.info({ config: env.DBC_CONFIG, watched: addresses.length, source: env.GRPC_URL ? 'grpc' : 'rpc-ws' }, 'indexer starting')

  // Live first so nothing is missed while the backfill runs; the queue and
  // unique key reconcile the overlap.
  if (env.GRPC_URL) {
    grpc = new GrpcStream(env.GRPC_URL, env.GRPC_TOKEN, (tx) => void enqueue(tx), logger)
    await grpc.start(addresses)
  } else {
    for (const a of addresses) subscribeLogs(a)
  }
  for (const a of addresses) await backfill(a)

  // Safety net: re-walk from the cursor. Cheap when nothing was missed.
  const pollMs = env.GRPC_URL ? Math.max(env.POLL_INTERVAL_MS, 60_000) : env.POLL_INTERVAL_MS
  setInterval(() => {
    for (const a of processor.watchedAddresses()) void backfill(a)
  }, pollMs)

  // Pick up pools the service graduated.
  setInterval(async () => {
    const graduated = await prisma.token.findMany({ where: { dammPool: { not: null } }, select: { mint: true, dammPool: true } })
    for (const t of graduated) processor.registerDammPool(t.dammPool!, t.mint)
  }, 30_000)
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down')
  for (const id of logSubs.values()) await solana.connection.removeOnLogsListener(id).catch(() => {})
  await queue.catch(() => {})
  await prisma.$disconnect()
  redis.disconnect()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

main().catch((err) => {
  logger.fatal({ err: (err as Error).message }, 'indexer crashed')
  process.exit(1)
})
