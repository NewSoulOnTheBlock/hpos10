'use client'

import type { TokenDTO } from '@hpos-pad/shared'
import { ExternalLink, Globe, Send, Users } from 'lucide-react'
import { TokenImage } from '@/components/token-image'
import { CopyButton } from '@/components/copy-button'
import { StageBadge } from '@/components/stage-badge'
import { QuoteIcon } from '@/components/quote-icon'
import { Card } from '@/components/ui/card'
import { formatCompact, formatPct, formatPrice, formatUsd, shortAddress, timeAgo } from '@/lib/format'
import { solscanToken } from '@/lib/solana'
import { useLaunchpadConfig, useReflectionsOn } from '@/hooks/use-config'
import { cn } from '@/lib/utils'

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

/** The unit's status console: portrait, identity, evolution stage and the key readouts. */
export function TokenHeader({ token }: { token: TokenDTO }) {
  const { data: config } = useLaunchpadConfig()
  const reflections = useReflectionsOn()
  const q = config?.quote.symbol ?? 'HPOS10I'
  const socials = [
    token.website && { href: token.website, label: 'Website', icon: <Globe className="size-4" /> },
    token.twitter && { href: token.twitter, label: 'X', icon: <XIcon className="size-3.5" /> },
    token.telegram && { href: token.telegram, label: 'Telegram', icon: <Send className="size-4" /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[]

  const change = token.priceChange24h

  return (
    <Card title="Unit Profile" leds={['blue', 'green']} className="flex flex-col gap-4 p-3 sm:p-4 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <TokenImage src={token.imageUrl} symbol={token.symbol} className="size-16 sm:size-20" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 truncate font-display text-lg font-extrabold uppercase tracking-[0.08em] text-foreground sm:text-2xl">
              {token.name}
            </h1>
            <span className="font-mono text-base kit-cyan sm:text-lg">${token.symbol}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge status={token.status} progress={token.progress} />
            {token.status === 'CURVE' && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                curve <span className="text-phosphor-bright">{(token.progress * 100).toFixed(1)}%</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
            <span className="inline-flex items-center">
              CA <CopyButton value={token.mint} label={shortAddress(token.mint, 5)} />
            </span>
            <a
              href={solscanToken(token.mint, config?.cluster)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-[2px] outline-none hover:text-[#f0a818] focus-visible:ring-2 focus-visible:ring-ring"
            >
              Solscan <ExternalLink className="size-3" />
            </a>
            <span>Spawned {timeAgo(token.createdAt)} ago</span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" /> {token.holders}
            </span>
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-[2px] outline-none hover:text-[#f0a818] focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={s.label}
              >
                {s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:w-[min(560px,50%)] md:shrink-0 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Price" value={token.priceUsd !== null ? formatUsd(token.priceUsd) : `${formatPrice(token.priceQuote)} ${q}`} />
        <Stat
          label="Market cap"
          value={token.marketCapUsd !== null ? formatUsd(token.marketCapUsd) : `${formatCompact(token.marketCapQuote)} ${q}`}
        />
        <Stat
          label="24h"
          value={formatPct(change, 1)}
          className={change === null ? 'text-muted-foreground' : change >= 0 ? 'text-success' : 'text-destructive'}
        />
        {reflections ? (
          <Stat label="Reflected" icon value={`${formatCompact(token.reflectedTotalQuote)} ${q}`} />
        ) : (
          <Stat
            label="Creator earned"
            icon
            value={`${formatCompact(token.creatorEarnedQuote)} ${q}`}
            sub={`of ${formatCompact(token.feesTotalQuote)} ${q} fees`}
          />
        )}
      </div>
    </Card>
  )
}

function Stat({
  label,
  value,
  sub,
  icon,
  className,
}: {
  label: string
  value: string
  sub?: string
  icon?: boolean
  className?: string
}) {
  return (
    <div className="kit-well min-w-0 px-2.5 py-2">
      <p className="truncate font-display text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={cn('flex items-center gap-1 truncate font-mono text-base tabular-nums sm:text-lg', className ?? 'sc-text')}>
        {icon && <QuoteIcon className="size-3.5" />}
        <span className="truncate">{value}</span>
      </p>
      {sub && <p className="truncate font-mono text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
