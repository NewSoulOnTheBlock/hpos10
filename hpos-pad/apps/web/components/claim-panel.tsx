'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import { QuoteIcon } from '@/components/quote-icon'
import { useClaimable } from '@/hooks/use-claim'
import { useLaunchpadConfig } from '@/hooks/use-config'
import { formatAmount, formatUsd, num } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Rewards credited to a wallet but not sent yet (all tokens combined). No
 * action needed: the service sends them automatically, opening the holder's
 * quote token account if they have none.
 */
export function ClaimPanel({ address, quoteUsd, className }: { address: string; quoteUsd: number | null; className?: string }) {
  const { data: config } = useLaunchpadConfig()
  const { data } = useClaimable(address)
  const q = quoteDisplaySymbol(config?.quote.symbol)
  if (!data) return null
  const pending = num(data.claimableQuote) + (data.pending ? num(data.pending.amountQuote) : 0)
  if (pending <= 0) return null

  return (
    <div className={cn('kit-well flex flex-col gap-2 border-phosphor/40 p-3', className)}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] kit-stencil">
          <span className="led on-amber animate-pulse-dot" aria-hidden /> In transit
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-xl sc-text">
          <QuoteIcon className="size-4" /> {formatAmount(String(pending))} {q}
          {quoteUsd ? <span className="text-xs text-muted-foreground [text-shadow:none]">≈ {formatUsd(pending * quoteUsd)}</span> : null}
        </p>
      </div>
      <p className="font-mono text-xs leading-snug text-muted-foreground">
        &gt; auto-sent to your wallet, no claim needed. Dust waits until it reaches 1 {q}.
      </p>
    </div>
  )
}
