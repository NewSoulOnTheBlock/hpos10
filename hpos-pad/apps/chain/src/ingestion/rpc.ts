import { type Connection, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import type { NormalizedTx } from './types.js'

/** getTransaction(encoding: json) as the RPC returns it, for any message version. */
type JsonIx = { programIdIndex: number; accounts: number[]; data: string }
export type RpcJsonTx = {
  slot: number
  blockTime: number | null
  version?: number | 'legacy'
  transaction: { signatures: string[]; message: { accountKeys: string[]; instructions: JsonIx[] } }
  meta: {
    err: unknown
    loadedAddresses?: { writable: string[]; readonly: string[] }
    innerInstructions?: { index: number; instructions: JsonIx[] }[]
  } | null
}

/**
 * Normalize from the RPC's raw JSON rather than web3.js message classes, so
 * new message versions (v1, SIMD-0385, already live on mainnet) index
 * without waiting for a library upgrade. Key order is the runtime's: static
 * keys, then loaded writable, then loaded readonly.
 */
export function normalizeRpcTx(tx: RpcJsonTx): NormalizedTx | null {
  if (!tx.meta || tx.meta.err) return null
  const accountKeys = [
    ...tx.transaction.message.accountKeys,
    ...(tx.meta.loadedAddresses?.writable ?? []),
    ...(tx.meta.loadedAddresses?.readonly ?? []),
  ]
  const decode = (ix: JsonIx) => ({ programIdIndex: ix.programIdIndex, accounts: ix.accounts, data: bs58.decode(ix.data) })
  const inner = new Map<number, NormalizedTx['instructions'][number]['inner']>()
  for (const g of tx.meta.innerInstructions ?? []) inner.set(g.index, g.instructions.map(decode))
  return {
    signature: tx.transaction.signatures[0]!,
    slot: tx.slot,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    accountKeys,
    instructions: tx.transaction.message.instructions.map((ix, i) => ({ ...decode(ix), inner: inner.get(i) ?? [] })),
  }
}

/** Highest message version this indexer accepts; the JSON path handles any layout. */
const MAX_TX_VERSION = 1

async function rawGetTransaction(connection: Connection, signature: string): Promise<RpcJsonTx | null> {
  const res = await fetch(connection.rpcEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [signature, { encoding: 'json', maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: 'confirmed' }],
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await res.json()) as { result?: RpcJsonTx | null; error?: { message: string } }
  if (body.error) throw new Error(`getTransaction: ${body.error.message}`)
  return body.result ?? null
}

/** getTransaction with a short retry: a signature seen on the websocket can precede RPC availability. */
export async function fetchTx(connection: Connection, signature: string, attempts = 6): Promise<RpcJsonTx | null> {
  for (let i = 0; i < attempts; i++) {
    const tx = await rawGetTransaction(connection, signature)
    if (tx) return tx
    await new Promise((r) => setTimeout(r, 500 * (i + 1)))
  }
  return null
}

/**
 * Every successful signature touching `address` newer than `until`, oldest
 * first. Pages backwards with `before` until it reaches the cursor, so a gap
 * of any length is recovered exactly once.
 */
export async function signaturesSince(
  connection: Connection,
  address: PublicKey,
  until: string | undefined,
  max: number,
): Promise<{ signature: string; slot: number }[]> {
  const out: { signature: string; slot: number }[] = []
  let before: string | undefined
  while (out.length < max) {
    const page = await connection.getSignaturesForAddress(
      address,
      { before, until, limit: Math.min(1000, max - out.length) },
      'confirmed',
    )
    if (page.length === 0) break
    for (const s of page) if (!s.err) out.push({ signature: s.signature, slot: s.slot })
    before = page[page.length - 1]!.signature
    if (page.length < 1000) break
  }
  return out.reverse()
}

export { PublicKey }
