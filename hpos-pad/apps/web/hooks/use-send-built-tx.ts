'use client'

import { useCallback } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { type Connection, VersionedTransaction, type Keypair } from '@solana/web3.js'
import type { BuiltTransaction } from '@hpos-pad/shared'

export class TxError extends Error {
  constructor(
    message: string,
    readonly signature?: string,
  ) {
    super(message)
    this.name = 'TxError'
  }
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Turn wallet/RPC failures into messages a trader can act on. */
export function describeTxError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/user rejected|rejected the request|denied/i.test(msg)) return 'You rejected the transaction in your wallet.'
  if (/insufficient (funds|lamports)|0x1\b/i.test(msg)) return 'You require more minerals. (Not enough SOL or $BITCOIN to cover this and network fees.)'
  if (/slippage|0x1771|ExceededSlippage|exceeds desired slippage/i.test(msg)) return 'Price moved beyond your slippage. Try again or raise slippage.'
  if (/block height exceeded|expired/i.test(msg)) return 'The transaction expired before landing. Please try again.'
  return msg.length > 180 ? `${msg.slice(0, 180)}…` : msg
}

/** Poll until a signature is confirmed; used for pre-transactions, whose expiry height we do not carry. */
export async function waitConfirmed(connection: Connection, signature: string, timeoutMs = 75_000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const st = (await connection.getSignatureStatuses([signature])).value[0]
    if (st?.err) throw new TxError(`Transaction failed on-chain: ${JSON.stringify(st.err)}`, signature)
    if (st?.confirmationStatus === 'confirmed' || st?.confirmationStatus === 'finalized') return
    await new Promise((r) => setTimeout(r, 1_000))
  }
  throw new TxError('The transaction expired before landing. Please try again.', signature)
}

/**
 * Sign a server-built transaction (plus any local signers, e.g. the new mint
 * keypair), send it, and wait for confirmation. When the server returns
 * `preTransactions` (a SOL swap that could not fit in the main transaction),
 * each is signed, sent and confirmed first; the main transaction is only
 * signed after, so every wallet prompt simulates cleanly.
 */
export function useSendBuiltTransaction() {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()

  return useCallback(
    async (built: BuiltTransaction, extraSigners: Keypair[] = [], opts: { onSigned?: () => void } = {}): Promise<string> => {
      if (!publicKey || !signTransaction) throw new TxError('Connect a wallet first.')
      const tx = VersionedTransaction.deserialize(base64ToBytes(built.transaction))
      if (extraSigners.length) tx.sign(extraSigners)

      // Pre-transactions (the SOL -> quote swap) are signed and landed one at
      // a time BEFORE the main transaction is shown. Signing them together
      // would make the wallet simulate the main transaction before the swap
      // exists, which fails and shows an "unsafe" warning.
      for (const b64 of built.preTransactions ?? []) {
        const pre = VersionedTransaction.deserialize(base64ToBytes(b64))
        const signedPre = await signTransaction(pre)
        const sig = await connection.sendRawTransaction(signedPre.serialize(), { skipPreflight: false, maxRetries: 3 })
        await waitConfirmed(connection, sig)
      }
      const signed = await signTransaction(tx)
      opts.onSigned?.()
      const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 })
      // Poll instead of confirmTransaction: it opens a websocket subscription,
      // and the /rpc proxy is HTTP only.
      await waitConfirmed(connection, signature)
      return signature
    },
    [connection, publicKey, signTransaction],
  )
}
