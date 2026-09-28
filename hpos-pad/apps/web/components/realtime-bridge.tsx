'use client'

import { useRef } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { ChainEvent, Paginated, TokenDTO, TokenListResponse, TradeDTO } from '@hpos-pad/shared'
import { useTopic } from '@/hooks/use-websocket'

type TradeEvent = Extract<ChainEvent, { type: 'trade' }>

/**
 * Keeps React Query caches live from the socket, so every list, card and
 * token page reflects trades without refetching.
 */
export function RealtimeBridge() {
  const qc = useQueryClient()
  const lastInvalidate = useRef(0)

  const patchToken = (mint: string, patch: Partial<TokenDTO>) => {
    qc.setQueryData<TokenDTO>(['token', mint], (t) => (t ? { ...t, ...patch } : t))
    qc.setQueriesData<InfiniteData<TokenListResponse>>({ queryKey: ['tokens'] }, (data) => {
      if (!data) return data
      let touched = false
      const pages = data.pages.map((p) => ({
        ...p,
        items: p.items.map((t) => {
          if (t.mint !== mint) return t
          touched = true
          return { ...t, ...patch }
        }),
      }))
      return touched ? { ...data, pages } : data
    })
  }

  /**
   * "Live" lists (sort=lastTrade): the traded token jumps to the top. If it
   * is not loaded in that list yet, refetch it (throttled) so it appears.
   */
  const bump = (mint: string) => {
    let missing = false
    for (const [key, data] of qc.getQueriesData<InfiniteData<TokenListResponse>>({ queryKey: ['tokens'] })) {
      const params = key[1] as { sort?: string; q?: string } | undefined
      if (params?.sort !== 'lastTrade' || params.q || !data?.pages.length) continue
      const all = data.pages.flatMap((p) => p.items)
      const hit = all.find((t) => t.mint === mint)
      if (!hit) {
        missing = true
        continue
      }
      const pages = data.pages.map((p, i) => ({
        ...p,
        items: i === 0 ? [hit, ...p.items.filter((t) => t.mint !== mint)] : p.items.filter((t) => t.mint !== mint),
      }))
      qc.setQueryData(key, { ...data, pages })
    }
    if (missing && Date.now() - lastInvalidate.current > 5_000) {
      lastInvalidate.current = Date.now()
      void qc.invalidateQueries({ queryKey: ['tokens', { sort: 'lastTrade' }], exact: false })
    }
  }

  const onTrade = (e: TradeEvent) => {
    const { trade, token } = e
    // Dollar figures move with every trade too; derive them from the trade's own
    // USD/quote rate so every card and page shows the same market cap.
    const quoteUsd = trade.priceUsd !== null && trade.priceQuote > 0 ? trade.priceUsd / trade.priceQuote : null
    patchToken(trade.mint, {
      priceQuote: token.priceQuote,
      marketCapQuote: token.marketCapQuote,
      progress: token.progress,
      status: token.status,
      lastTradeAt: trade.blockTime,
      ...(quoteUsd !== null ? { priceUsd: token.priceQuote * quoteUsd, marketCapUsd: token.marketCapQuote * quoteUsd } : {}),
    })
    bump(trade.mint)

    qc.setQueryData<InfiniteData<Paginated<TradeDTO>>>(['token-trades', trade.mint], (data) => {
      if (!data || data.pages.length === 0) return data
      const [first, ...rest] = data.pages
      if (first!.items.some((t) => t.signature === trade.signature && t.side === trade.side && t.baseAmount === trade.baseAmount)) {
        return data
      }
      return { ...data, pages: [{ ...first!, items: [trade, ...first!.items].slice(0, 200) }, ...rest] }
    })

    qc.setQueryData<TradeDTO[]>(['recent-trades'], (list) => (list ? [trade, ...list].slice(0, 50) : list))
  }

  useTopic('trades', (e) => {
    if (e.type === 'trade') onTrade(e)
  })

  useTopic('tokens', (e) => {
    if (e.type === 'token:update') {
      patchToken(e.token.mint, e.token)
      return
    }
    if (e.type === 'token:new') {
      qc.setQueryData(['token', e.token.mint], e.token)
      const now = Date.now()
      if (now - lastInvalidate.current > 3_000) {
        lastInvalidate.current = now
        qc.invalidateQueries({ queryKey: ['tokens'] })
        qc.invalidateQueries({ queryKey: ['stats'] })
      }
    }
  })

  return null
}
