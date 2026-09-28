'use client'

import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { VersionedTransaction } from '@solana/web3.js'
import { buildClaim, confirmClaim, fetchClaimable } from '@/lib/api'
import { base64ToBytes, waitConfirmed } from '@/hooks/use-send-built-tx'
import { num } from '@/lib/format'

export function useClaimable(address: string | null | undefined) {
  return useQuery({
    queryKey: ['claimable', address],
    queryFn: () => fetchClaimable(address!),
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
}

/**
 * Withdraw every accrued reflection (all tokens) in one transaction. The api
 * returns it already signed by the vault; the wallet signs as fee payer, which
 * also opens the holder's quote-token account the first time.
 */
export function useClaim() {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  const claim = useCallback(async (): Promise<{ signature: string; amount: string }> => {
    if (!publicKey || !signTransaction) throw new Error('Connect a wallet first.')
    setBusy(true)
    try {
      const owner = publicKey.toBase58()
      const built = await buildClaim(owner)
      const tx = VersionedTransaction.deserialize(base64ToBytes(built.transaction))
      const signed = await signTransaction(tx)
      const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 })
      // Report the signature right away so the claim settles even if this tab closes.
      await confirmClaim(built.claimId, signature).catch(() => undefined)
      await waitConfirmed(connection, signature)
      await confirmClaim(built.claimId, signature).catch(() => undefined)
      return { signature, amount: built.amountQuote }
    } finally {
      setBusy(false)
      void qc.invalidateQueries({ queryKey: ['claimable'] })
      void qc.invalidateQueries({ queryKey: ['wallet-earnings'] })
      void qc.invalidateQueries({ queryKey: ['balance'] })
    }
  }, [connection, publicKey, signTransaction, qc])

  return { claim, busy }
}

export const canClaim = (claimable: string | undefined, min: string | undefined) => num(claimable) > 0 && num(claimable) >= num(min)
