'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { Timeframe } from '@hpos-pad/shared'
import {
  fetchCandles,
  fetchHolders,
  fetchRecentTrades,
  fetchStats,
  fetchToken,
  fetchTokenReflections,
  fetchTokens,
  fetchTokenTrades,
  type TokenListParams,
} from '@/lib/api'

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: fetchStats, staleTime: 15_000, refetchInterval: 30_000 })
}

export function useTokenList(params: Omit<TokenListParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: ['tokens', params],
    queryFn: ({ pageParam }) => fetchTokens({ ...params, limit: params.limit ?? 30, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
    refetchInterval: 20_000,
  })
}

export function useToken(mint: string, enabled = true) {
  return useQuery({
    queryKey: ['token', mint],
    queryFn: () => fetchToken(mint),
    enabled: enabled && !!mint,
    staleTime: 3_000,
    // A freshly launched token 404s until the indexer sees it; keep polling briefly.
    retry: (count, err) => count < 10 && (err as { status?: number }).status === 404,
    retryDelay: 2_000,
    refetchInterval: 15_000,
  })
}

export function useTokenTrades(mint: string) {
  return useInfiniteQuery({
    queryKey: ['token-trades', mint],
    queryFn: ({ pageParam }) => fetchTokenTrades(mint, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 5_000,
  })
}

export function useCandles(mint: string, tf: Timeframe) {
  return useQuery({
    queryKey: ['candles', mint, tf],
    queryFn: () => fetchCandles(mint, tf),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useHolders(mint: string) {
  return useQuery({
    queryKey: ['holders', mint],
    queryFn: () => fetchHolders(mint),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useTokenReflections(mint: string) {
  return useInfiniteQuery({
    queryKey: ['token-reflections', mint],
    queryFn: ({ pageParam }) => fetchTokenReflections(mint, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  })
}

export function useRecentTrades() {
  return useQuery({ queryKey: ['recent-trades'], queryFn: () => fetchRecentTrades(30), staleTime: 10_000 })
}
