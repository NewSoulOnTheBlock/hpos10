import {
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'

const COMPUTE_BUDGET = ComputeBudgetProgram.programId.toBase58()

/** Drop SDK-added compute budget ixs; a transaction may only carry one of each. */
export function withoutComputeBudget(ixs: TransactionInstruction[]): TransactionInstruction[] {
  return ixs.filter((ix) => ix.programId.toBase58() !== COMPUTE_BUDGET)
}

export type Sender = {
  /**
   * Sign and send. The signature is known before the network sees the
   * transaction and handed to `onSigned`, so a caller can persist it first:
   * after a crash, "was this sent?" is answered by the chain, never by
   * resending (which would double-pay).
   */
  send(
    ixs: TransactionInstruction[],
    signers: Keypair[],
    opts?: { computeUnits?: number; onSigned?: (signature: string, lastValidBlockHeight: number) => Promise<void> },
  ): Promise<string>
  landed(signature: string): Promise<'landed' | 'failed' | 'unknown'>
}

export function createSender(connection: Connection, priorityMicroLamports: number): Sender {
  async function landed(signature: string): Promise<'landed' | 'failed' | 'unknown'> {
    const st = await connection.getSignatureStatus(signature, { searchTransactionHistory: true })
    if (!st.value) return 'unknown'
    return st.value.err ? 'failed' : 'landed'
  }

  async function send(
    ixs: TransactionInstruction[],
    signers: Keypair[],
    opts: { computeUnits?: number; onSigned?: (signature: string, lastValidBlockHeight: number) => Promise<void> } = {},
  ): Promise<string> {
    const payer = signers[0]!
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: opts.computeUnits ?? 400_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
        ...withoutComputeBudget(ixs),
      ],
    }).compileToV0Message()
    const tx = new VersionedTransaction(message)
    tx.sign(signers)
    const signature = bs58.encode(tx.signatures[0]!)
    await opts.onSigned?.(signature, lastValidBlockHeight)

    const raw = tx.serialize()
    // Rebroadcast until confirmed or the blockhash expires; the same bytes
    // can never execute twice, so this is safe.
    let blockHeight = await connection.getBlockHeight('confirmed')
    while (blockHeight <= lastValidBlockHeight) {
      await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 0 }).catch((err: Error) => {
        // Preflight failures are real failures; surface them.
        if (!/already been processed/i.test(err.message)) throw err
      })
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 1_000))
        const st = await connection.getSignatureStatus(signature)
        if (st.value?.err) throw new Error(`transaction ${signature} failed: ${JSON.stringify(st.value.err)}`)
        if (st.value?.confirmationStatus === 'confirmed' || st.value?.confirmationStatus === 'finalized') return signature
      }
      blockHeight = await connection.getBlockHeight('confirmed')
    }
    if ((await landed(signature)) === 'landed') return signature
    throw new Error(`transaction ${signature} expired before confirming`)
  }

  return { send, landed }
}
