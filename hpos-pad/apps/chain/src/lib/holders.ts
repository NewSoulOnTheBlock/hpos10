import { type Connection, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

export type Holder = { owner: string; amount: bigint }

/**
 * Every holder of `mint`, aggregated per owner. A token account is 165 bytes:
 * mint 0..32, owner 32..64, amount 64..72 (u64 LE); the RPC filters on mint
 * and returns only owner+amount, so a large snapshot stays small.
 */
export async function snapshotHolders(connection: Connection, mint: string): Promise<Holder[]> {
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
    dataSlice: { offset: 32, length: 40 },
  })
  const byOwner = new Map<string, bigint>()
  for (const { account } of accounts) {
    const buf = account.data
    const amount = buf.readBigUInt64LE(32)
    if (amount === 0n) continue
    const owner = new PublicKey(buf.subarray(0, 32)).toBase58()
    byOwner.set(owner, (byOwner.get(owner) ?? 0n) + amount)
  }
  return [...byOwner.entries()]
    .map(([owner, amount]) => ({ owner, amount }))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
}

export type Allocation = { payouts: { owner: string; amount: bigint }[]; carry: bigint }

/**
 * Split `pot` pro-rata by balance with integer math only: nothing is
 * invented or lost. Excluded wallets and program-owned accounts (PDAs, e.g.
 * the bonding curve's own inventory) earn nothing. Rounding remainders and
 * shares under `minPayout` are returned as carry for the next epoch.
 */
export function allocate(
  holders: Holder[],
  pot: bigint,
  opts: { minPayout: bigint; minHoldingBps: number; excluded: Set<string> },
): Allocation {
  const eligible = holders.filter((h) => !opts.excluded.has(h.owner) && PublicKey.isOnCurve(new PublicKey(h.owner).toBuffer()))
  const total = eligible.reduce((a, h) => a + h.amount, 0n)
  if (total === 0n || pot === 0n) return { payouts: [], carry: pot }

  const minHolding = (total * BigInt(opts.minHoldingBps)) / 10_000n
  const weighted = eligible.filter((h) => h.amount >= minHolding)
  const weightedTotal = weighted.reduce((a, h) => a + h.amount, 0n)
  if (weightedTotal === 0n) return { payouts: [], carry: pot }

  const payouts: Allocation['payouts'] = []
  let paid = 0n
  for (const h of weighted) {
    const share = (pot * h.amount) / weightedTotal
    if (share < opts.minPayout) continue
    payouts.push({ owner: h.owner, amount: share })
    paid += share
  }
  return { payouts, carry: pot - paid }
}
