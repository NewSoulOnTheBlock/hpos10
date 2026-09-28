import * as yellowstone from '@triton-one/yellowstone-grpc'
import { CommitmentLevel, type SubscribeRequest, type SubscribeUpdate } from '@triton-one/yellowstone-grpc'
import bs58 from 'bs58'
import type pino from 'pino'
import type { NormalizedTx } from './types.js'

// The package is CommonJS with a default-exported class; under NodeNext ESM
// interop the class can sit one `.default` deeper than the types claim.
type ClientCtor = typeof yellowstone.default.default
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Client: ClientCtor = ((yellowstone as any).default?.default ?? (yellowstone as any).default) as ClientCtor
type ClientInstance = InstanceType<ClientCtor>

export function normalizeGrpcTx(update: NonNullable<SubscribeUpdate['transaction']>): NormalizedTx | null {
  const info = update.transaction
  const msg = info?.transaction?.message
  if (!info || !msg || !info.meta || info.meta.err) return null

  // Runtime order: static keys, then loaded writable, then loaded readonly.
  const accountKeys = [
    ...msg.accountKeys,
    ...info.meta.loadedWritableAddresses,
    ...info.meta.loadedReadonlyAddresses,
  ].map((k) => bs58.encode(k))

  const inner = new Map<number, NormalizedTx['instructions'][number]['inner']>()
  for (const group of info.meta.innerInstructions) {
    inner.set(
      group.index,
      group.instructions.map((ix) => ({ programIdIndex: ix.programIdIndex, accounts: [...ix.accounts], data: ix.data })),
    )
  }

  return {
    signature: bs58.encode(info.signature),
    slot: Number(update.slot),
    blockTime: null,
    accountKeys,
    instructions: msg.instructions.map((ix, i) => ({
      programIdIndex: ix.programIdIndex,
      accounts: [...ix.accounts],
      data: ix.data,
      inner: inner.get(i) ?? [],
    })),
  }
}

/**
 * Yellowstone gRPC live stream, filtered server-side to transactions that
 * touch any watched address (the DBC config + every graduated DAMM v2 pool).
 * The SDK's auto-reconnect replays from the last slot it saw; the cursor
 * backfill in the indexer heals anything older.
 */
export class GrpcStream {
  private stream: Awaited<ReturnType<ClientInstance['subscribe']>> | null = null
  private addresses: string[] = []

  constructor(
    private readonly url: string,
    private readonly token: string | undefined,
    private readonly onTx: (tx: NormalizedTx) => void,
    private readonly logger: pino.Logger,
  ) {}

  private request(): SubscribeRequest {
    return {
      accounts: {},
      slots: {},
      transactions: {
        hpospad: { vote: false, failed: false, accountInclude: this.addresses, accountExclude: [], accountRequired: [] },
      },
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      accountsDataSlice: [],
      commitment: CommitmentLevel.CONFIRMED,
    }
  }

  async start(addresses: string[]): Promise<void> {
    this.addresses = [...new Set(addresses)]
    const client = new Client(this.url, this.token, undefined, { enabled: true })
    await client.connect()
    this.stream = await client.subscribe(this.request())
    this.stream.on('data', (u: SubscribeUpdate) => {
      if (!u.transaction) return
      const tx = normalizeGrpcTx(u.transaction)
      if (tx) this.onTx(tx)
    })
    this.stream.on('error', (err: Error) => this.logger.error({ err: err.message }, 'grpc stream error'))
    this.stream.on('end', () => this.logger.warn('grpc stream ended'))
    // Keep the connection alive through idle load balancers.
    setInterval(() => this.write({ ...this.request(), ping: { id: 1 } }), 30_000).unref()
    this.logger.info({ addresses: this.addresses.length }, 'grpc stream subscribed')
  }

  /** Replace the filter in place; Yellowstone applies a new request on the same stream. */
  watch(address: string): void {
    if (this.addresses.includes(address)) return
    this.addresses.push(address)
    this.write(this.request())
  }

  private write(req: SubscribeRequest): void {
    this.stream?.write(req, (err?: Error | null) => {
      if (err) this.logger.warn({ err: err.message }, 'grpc write failed')
    })
  }
}
