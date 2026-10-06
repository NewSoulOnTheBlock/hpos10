'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import { useQuery } from '@tanstack/react-query'
import { feeSplit, type LaunchpadConfigDTO } from '@hpos-pad/shared'
import { fetchConfig } from '@/lib/api'

export function useLaunchpadConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: 5 * 60_000,
    retry: 3,
  })
}

/** Quote symbol with a sane fallback while /config loads. */
export function useQuoteSymbol(): string {
  return quoteDisplaySymbol(useLaunchpadConfig().data?.quote.symbol)
}

/**
 * Whether holders receive reflections. Off by default on the Hatchery (the
 * fee goes to the creator and the platform); every holder-reward surface
 * hides itself when this is false. `undefined` while /config loads.
 */
export function useReflectionsOn(): boolean | undefined {
  const cfg = useLaunchpadConfig().data
  return cfg ? cfg.fees.reflectionBps > 0 : undefined
}

/** Short fee label for places a trader acts (create form, trade panel). The full split lives in About and /docs. */
export function feeShort(cfg: LaunchpadConfigDTO | undefined): string {
  if (!cfg) return ''
  const holders = cfg.fees.reflectionBps > 0 ? ` · ${cfg.fees.reflectionBps / 100}% to holders` : ''
  const creator = cfg.fees.creatorBps > 0 ? ` · ${cfg.fees.creatorBps / 100}% to creator` : ''
  return `${cfg.fees.tradeFeeBps / 100}% fee in ${quoteDisplaySymbol(cfg.quote.symbol)}${creator}${holders}`
}

export { feeSplit }
