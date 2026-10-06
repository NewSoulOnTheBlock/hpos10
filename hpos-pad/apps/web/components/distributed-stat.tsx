'use client'

import { useStats } from '@/hooks/use-tokens'
import { formatCompact, formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { QuoteIcon } from '@/components/quote-icon'
import { QUOTE_TICKER } from '@/lib/quote-display'

/**
 * How much $BITCOIN (HPOS10I, the quote token; wallets show it as BITCOIN)
 * the platform has paid out so far: creators' share plus holder reflections.
 * Holders are named only once reflections have actually paid them, so the
 * line never claims a payout that didn't happen.
 */
export function DistributedStat({ className }: { className?: string }) {
  const stats = useStats().data
  if (!stats) return null
  const creators = Number(stats.creatorEarnedTotalQuote)
  const holders = Number(stats.reflectedTotalQuote)
  const total = creators + holders
  const to = holders > 0 ? 'creators & holders' : 'creators'
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <QuoteIcon className="size-9 shrink-0" />
      <div className="min-w-0">
        <p className="kit-amber font-display text-[11px] font-bold uppercase tracking-[0.2em]">Distributed so far</p>
        <p className="sc-text font-display text-xl font-bold leading-tight tabular-nums">{formatCompact(total)} {QUOTE_TICKER}</p>
        <p className="text-xs text-muted-foreground">
          {stats.quoteUsd !== null && <>≈ {formatUsd(total * stats.quoteUsd)} </>}paid to {to}
          {holders > 0 && (
            <span className="block font-mono text-[11px]">
              creators {formatCompact(creators)} · holders {formatCompact(holders)}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
