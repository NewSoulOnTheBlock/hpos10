'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fetchWalletEarnings, fetchWalletReflections, fetchWalletTrades } from '@/lib/api'

export function useWalletReflections(address: string) {
  return useInfiniteQuery({
    queryKey: ['wallet-reflections', address],
    queryFn: ({ pageParam }) => fetchWalletReflections(address, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  })
}

export function useWalletTrades(address: string) {
  return useInfiniteQuery({
    queryKey: ['wallet-trades', address],
    queryFn: ({ pageParam }) => fetchWalletTrades(address, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  })
}

/** Reflections received, per token (or for one token with `mint`). */
export function useWalletEarnings(address: string | null | undefined, mint?: string) {
  return useQuery({
    queryKey: ['wallet-earnings', address, mint ?? null],
    queryFn: () => fetchWalletEarnings(address!, mint),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
