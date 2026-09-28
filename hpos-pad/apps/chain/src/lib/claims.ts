import type { Connection } from '@solana/web3.js'

/**
 * How much of `mint` the transaction delivered to `owner`, read from the
 * transaction's own pre/post token balances. Unlike a wallet balance diff
 * this is exact even if something else touched the wallet, and it can be
 * recomputed after a crash from the signature alone.
 */
export async function receivedInTx(connection: Connection, signature: string, owner: string, mint: string): Promise<bigint | null> {
  for (let i = 0; i < 6; i++) {
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
    if (tx?.meta) {
      if (tx.meta.err) return null
      const sum = (rows: typeof tx.meta.postTokenBalances) =>
        (rows ?? [])
          .filter((b) => b.owner === owner && b.mint === mint)
          .reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n)
      const delta = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances)
      return delta > 0n ? delta : 0n
    }
    await new Promise((r) => setTimeout(r, 1_000 * (i + 1)))
  }
  return null
}
