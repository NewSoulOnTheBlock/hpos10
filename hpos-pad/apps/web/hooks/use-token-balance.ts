'use client'

import { useQuery } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'

/** The connected wallet's UI balance of `mint`, summed across token accounts. */
export function useTokenBalance(mint: string) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  return useQuery({
    queryKey: ['balance', publicKey?.toBase58(), mint],
    enabled: !!publicKey,
    // Wallet balances change outside the site (a transfer from Phantom), so re-read
    // them on return to the tab and every few seconds while it's open.
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await connection.getParsedTokenAccountsByOwner(publicKey!, { mint: new PublicKey(mint) })
      let total = 0
      let raw = 0n
      let decimals = 6
      for (const a of res.value) {
        const info = a.account.data.parsed?.info?.tokenAmount as { amount: string; decimals: number; uiAmount: number | null } | undefined
        if (!info) continue
        raw += BigInt(info.amount)
        decimals = info.decimals
        total += info.uiAmount ?? 0
      }
      return { ui: total, raw, decimals }
    },
  })
}
