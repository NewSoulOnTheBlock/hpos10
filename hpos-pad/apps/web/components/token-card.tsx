'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { TokenDTO } from '@hpos-pad/shared'
import { BadgeCheck, Crown, Users } from 'lucide-react'
import { TokenImage } from '@/components/token-image'
import { Progress } from '@/components/ui/progress'
import { StageBadge } from '@/components/stage-badge'
import { formatCompact, formatPct, formatUsd, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { QuoteIcon } from '@/components/quote-icon'
import { CopyButton } from '@/components/copy-button'
import { useReflectionsOn } from '@/hooks/use-config'

/** A unit card: portrait in a monitor bezel, readouts on a dark screen, inside a small kit panel. */
export function TokenCard({
  token,
  quoteSymbol,
  mascot = false,
  official = false,
}: {
  token: TokenDTO
  quoteSymbol: string
  mascot?: boolean
  official?: boolean
}) {
  const change = token.priceChange24h
  const reflections = useReflectionsOn()
  // Flash when a live trade lands (lastTradeAt changes after first render).
  const [flash, setFlash] = useState(false)
  const seen = useRef(token.lastTradeAt)
  useEffect(() => {
    if (token.lastTradeAt === seen.current) return
    seen.current = token.lastTradeAt
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 900)
    return () => clearTimeout(t)
  }, [token.lastTradeAt])
  return (
    <Link
      href={`/token/${token.mint}`}
      className="kit-panel kit-panel-sm group outline-none transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110 hover:drop-shadow-[0_0_8px_rgb(240_168_24/0.35)] focus-visible:brightness-125"
    >
      <div
        className={cn(
          'kit-screen flex gap-3 p-2 sm:p-2.5',
          (mascot || official) && 'rounded-[3px] shadow-[inset_0_0_0_1px_rgb(240_168_24/0.45),inset_0_0_22px_rgb(240_168_24/0.12)]',
          flash && 'animate-bump',
        )}
      >
        <TokenImage src={token.imageUrl} symbol={token.symbol} className={cn('size-20 sm:size-24', token.lifeState === 'RUGGED' && 'grayscale brightness-50', token.lifeState === 'DEAD' && 'grayscale opacity-70')} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold uppercase tracking-wide text-foreground">{token.name}</p>
              <p className="flex items-center gap-1.5 truncate font-mono text-sm kit-cyan">
                ${token.symbol}
                <CopyButton value={token.mint} inLink toastText="Contract address copied" className="-my-1 px-1 py-0.5" />
                {official && (
                  <span className="inline-flex items-center gap-0.5 rounded-[2px] border border-[#f0a818]/60 bg-[#f0a818]/10 px-1.5 font-display text-[9px] font-bold uppercase tracking-wider kit-amber">
                    <BadgeCheck className="size-2.5" /> Official
                  </span>
                )}
                {mascot && (
                  <span className="inline-flex items-center gap-0.5 rounded-[2px] border border-[#f0a818]/60 bg-[#f0a818]/10 px-1.5 font-display text-[9px] font-bold uppercase tracking-wider kit-amber">
                    <Crown className="size-2.5" /> Mascot
                  </span>
                )}
              </p>
            </div>
            {token.lifeState === 'RUGGED' ? (
              <span className="shrink-0 rounded-[2px] border border-[#f40000]/70 bg-[#f40000]/15 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-[#ff4a3d]">☠ Rugged</span>
            ) : token.lifeState === 'DEAD' ? (
              <span className="shrink-0 rounded-[2px] border border-border px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Dead</span>
            ) : (
              <StageBadge status={token.status} progress={token.progress} />
            )}
          </div>

          <div className="flex items-baseline gap-2 font-mono text-sm">
            <span className="text-muted-foreground">MC</span>
            <span className="sc-text">
              {token.marketCapUsd !== null ? formatUsd(token.marketCapUsd) : `${formatCompact(token.marketCapQuote)} ${quoteSymbol}`}
            </span>
            <span
              className={cn(
                'ml-auto text-xs',
                change === null ? 'text-muted-foreground' : change >= 0 ? 'text-success' : 'text-destructive',
              )}
            >
              {formatPct(change, 1)}
            </span>
          </div>

          {token.status === 'CURVE' ? (
            <div className="flex items-center gap-2">
              <Progress value={token.progress} />
              <span className="w-10 text-right font-mono text-xs tabular-nums text-phosphor-bright">{Math.floor(token.progress * 100)}%</span>
            </div>
          ) : (
            <div className="h-2" />
          )}

          <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <QuoteIcon className="size-3.5" />
            <span className="truncate">
              {reflections
                ? `${formatCompact(token.reflectedTotalQuote)} ${quoteSymbol} reflected`
                : `${formatCompact(token.creatorEarnedQuote)} ${quoteSymbol} to creator`}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Users className="size-3" /> {token.holders}
            </span>
            <span className="hidden sm:inline">· {timeAgo(token.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export function TokenCardSkeleton() {
  return (
    <div className="kit-panel kit-panel-sm">
      <div className="kit-screen flex gap-3 p-2 sm:p-2.5">
        <div className="size-20 animate-pulse rounded-[4px] bg-muted sm:size-24" />
        <div className="flex flex-1 flex-col gap-2 py-1">
          <div className="h-4 w-2/3 animate-pulse rounded-[2px] bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded-[2px] bg-muted" />
          <div className="h-3 w-full animate-pulse rounded-[2px] bg-muted" />
          <div className="h-2 w-full animate-pulse rounded-[2px] bg-muted" />
        </div>
      </div>
    </div>
  )
}
