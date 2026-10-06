'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import { useLaunchpadConfig } from '@/hooks/use-config'
import { QuoteIcon } from '@/components/quote-icon'
import { cn } from '@/lib/utils'

const pct = (bps: number) => `${bps / 100}%`

/**
 * The trade fee and where it goes, read from /config. The creator's cut leads;
 * holders are only mentioned when reflections are on.
 */
export function FeeDisclosure({ className }: { className?: string }) {
  const { data } = useLaunchpadConfig()
  if (!data) return null
  const { tradeFeeBps, creatorBps, platformBps, protocolBps, reflectionBps } = data.fees
  const parts = [
    creatorBps > 0 && (
      <span key="creator" className="sc-text">
        {pct(creatorBps)} creator
      </span>
    ),
    reflectionBps > 0 && (
      <span key="holders" className="kit-cyan">
        {pct(reflectionBps)} holders
      </span>
    ),
    platformBps > 0 && <span key="platform">{pct(platformBps)} platform</span>,
    protocolBps > 0 && <span key="protocol">{pct(protocolBps)} Meteora</span>,
  ].filter(Boolean)
  return (
    <div className={cn('flex flex-col gap-1 font-mono text-xs', className)}>
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em] kit-stencil">Trade fee</span>
        <span className="kit-amber">{pct(tradeFeeBps)}</span>
        <span className="text-muted-foreground">in</span>
        <QuoteIcon className="size-3.5" />
        <span className="text-foreground">{quoteDisplaySymbol(data.quote.symbol)}</span>
      </p>
      <p className="flex flex-wrap gap-x-1.5 text-muted-foreground">
        {parts.map((p, i) => (
          <span key={i} className="inline-flex gap-1.5">
            {i > 0 && <span aria-hidden>·</span>}
            {p}
          </span>
        ))}
      </p>
    </div>
  )
}
