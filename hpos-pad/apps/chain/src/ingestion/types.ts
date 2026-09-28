/**
 * A transaction reduced to what the processor needs, identical whether it
 * came from Yellowstone gRPC or RPC `getTransaction`. Account keys include
 * addresses loaded from lookup tables, in the runtime's order (static,
 * loaded writable, loaded readonly), so instruction indexes resolve the same.
 */
export type RawIx = { programIdIndex: number; accounts: number[]; data: Uint8Array }

export type NormalizedTx = {
  signature: string
  slot: number
  /** Null when the source does not carry it (gRPC); the processor falls back to now. */
  blockTime: Date | null
  accountKeys: string[]
  instructions: (RawIx & { inner: RawIx[] })[]
}
