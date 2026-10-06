'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import Link from 'next/link'
import { BadgeCheck, Crown } from 'lucide-react'
import { useLaunchpadConfig, useReflectionsOn } from '@/hooks/use-config'
import { useToken } from '@/hooks/use-tokens'
import { TokenImage } from '@/components/token-image'
import { Progress } from '@/components/ui/progress'
import { formatAmount, formatCompact, formatPct, formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { QuoteIcon } from '@/components/quote-icon'
import { CopyButton } from '@/components/copy-button'

/**
 * Pinned above the board: the platform's official token (left) and the
 * mascot (right), side by side; stacked on phones. Each renders only if set.
 */
export function FeaturedCards() {
  const { data: config } = useLaunchpadConfig()
  if (!config) return null
  const official = config.officialMint
  const mascot = config.featuredMints[0]
  const cards = [
    official ? { mint: official, badge: 'Official token', Icon: BadgeCheck } : null,
    mascot && mascot !== official ? { mint: mascot, badge: 'Hatchery mascot', Icon: Crown } : null,
  ].filter((c): c is { mint: string; badge: string; Icon: typeof Crown } => c !== null)
  if (cards.length === 0) return null
  return (
    <div className={cn('grid gap-3', cards.length > 1 && 'md:grid-cols-2')}>
      {cards.map((c) => (
        <FeaturedCard key={c.mint} mint={c.mint} badge={c.badge} Icon={c.Icon} quoteSymbol={quoteDisplaySymbol(config.quote.symbol)} />
      ))}
    </div>
  )
}

function FeaturedCard({ mint, quoteSymbol, badge, Icon }: { mint: string; quoteSymbol: string; badge: string; Icon: typeof Crown }) {
  const { data: t } = useToken(mint)
  const reflections = useReflectionsOn()
  if (!t) return <div className="kit-panel h-36 animate-pulse" />
  const change = t.priceChange24h
  return (
    <Link href={`/token/${t.mint}`} className="kit-panel group outline-none transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110 hover:drop-shadow-[0_0_10px_rgb(240_168_24/0.35)]">
      <div className="kit-screen relative flex items-center gap-4 overflow-hidden rounded-[3px] p-3 shadow-[inset_0_0_0_1px_rgb(240_168_24/0.4)] sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_left,rgb(240_168_24/0.14),transparent_60%)]" />
      <TokenImage src={t.imageUrl} symbol={t.symbol} className="relative size-20 shrink-0 sm:size-24" />
      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="inline-flex w-fit items-center gap-1 rounded-[2px] border border-[#f0a818]/60 bg-[#f0a818]/10 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] kit-amber">
          <Icon className="size-3" /> {badge}
        </span>
        <div className="flex items-baseline gap-2">
          <p className="truncate font-display text-lg font-extrabold uppercase tracking-wide sc-text sm:text-xl">{t.name}</p>
          <p className="flex items-center truncate font-mono text-sm kit-cyan">
            ${t.symbol}
            <CopyButton value={t.mint} inLink toastText="Contract address copied" className="-my-1 px-1 py-0.5" />
          </p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-sm">
          <span>
            <span className="text-muted-foreground">MC </span>
            <span className="font-semibold">{t.marketCapUsd !== null ? formatUsd(t.marketCapUsd) : `${formatCompact(t.marketCapQuote)} ${quoteSymbol}`}</span>
          </span>
          <span className={cn('text-xs', change === null ? 'text-muted-foreground' : change >= 0 ? 'text-success' : 'text-destructive')}>{formatPct(change, 1)}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <QuoteIcon className="size-3" />{' '}
            {reflections
              ? `${formatAmount(t.reflectedTotalQuote)} ${quoteSymbol} reflected`
              : `${formatAmount(t.creatorEarnedQuote)} ${quoteSymbol} to creator`}
          </span>
        </div>
        {t.status === 'CURVE' && (
          <div className="flex items-center gap-2">
            <Progress value={t.progress} />
            <span className="w-10 text-right font-mono text-xs tabular-nums text-phosphor-bright">{Math.floor(t.progress * 100)}%</span>
          </div>
        )}
      </div>
      </div>
    </Link>
  )
}
