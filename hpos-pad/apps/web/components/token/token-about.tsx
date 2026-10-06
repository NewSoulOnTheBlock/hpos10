'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import type { TokenDTO } from '@hpos-pad/shared'
import { useLaunchpadConfig } from '@/hooks/use-config'
import { bpsToPct, formatAmount, formatUsd, num } from '@/lib/format'
import { WalletLink } from '@/components/address-link'
import { QuoteIcon } from '@/components/quote-icon'
import { cn } from '@/lib/utils'

/** "a", "a and b", "a, b and c". */
function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

const HEAD = 'mb-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] kit-stencil'

/** Intel: the creator's description, the fee split read from config, and what the fee has paid so far. */
export function TokenAbout({ token }: { token: TokenDTO }) {
  const { data: config } = useLaunchpadConfig()
  const f = config?.fees
  const q = quoteDisplaySymbol(config?.quote.symbol)
  const quoteUsd = token.priceUsd && token.priceQuote ? token.priceUsd / token.priceQuote : null
  const holders = !!f && f.reflectionBps > 0

  // Only the recipients that actually get a cut; holders only when reflections are on.
  const parts = f
    ? [
        { label: 'Holders (reflected)', short: 'holders', bps: f.reflectionBps, bar: 'bg-phosphor shadow-glow-sm', hot: true },
        { label: 'Token creator', short: 'the creator', bps: f.creatorBps, bar: 'bg-sonic' },
        { label: 'Platform', short: 'the platform', bps: f.platformBps, bar: 'bg-cyan' },
        { label: 'Meteora protocol', short: 'Meteora', bps: f.protocolBps, bar: 'bg-steel-light' },
      ].filter((p) => p.bps > 0)
    : []

  const totals = [
    { label: 'Fees generated', v: token.feesTotalQuote },
    ...(holders ? [{ label: 'Paid to holders', v: token.reflectedTotalQuote, hot: true }] : []),
    { label: 'Paid to creator', v: token.creatorEarnedQuote, hot: !holders },
    ...(holders ? [{ label: 'Waiting for next payout', v: token.pendingReflectionQuote }] : []),
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="kit-well p-4">
        <h3 className={HEAD}>Briefing</h3>
        <p className="whitespace-pre-line break-words text-sm leading-relaxed">
          {token.description || <span className="font-mono text-muted-foreground">&gt; no briefing filed by the creator.</span>}
        </p>
        <div className="mt-4 flex flex-col gap-1 font-mono text-xs text-muted-foreground">
          <span>
            CREATOR <WalletLink address={token.creator} />
          </span>
          <span className="break-all">CURVE POOL {token.pool}</span>
        </div>
      </div>
      <div className="kit-well p-4">
        <h3 className={cn(HEAD, 'flex flex-wrap items-center gap-1.5')}>
          {f ? (
            <>
              {bpsToPct(f.tradeFeeBps)} trade fee · paid in <QuoteIcon className="size-3.5" /> {q}
            </>
          ) : (
            'Trade fee'
          )}
        </h3>
        {f ? (
          <>
            <div className="kit-well mb-3 flex h-3 overflow-hidden rounded-[1px]" aria-hidden>
              {parts.map((p) => (
                <div key={p.label} className={p.bar} style={{ width: `${(p.bps / f.tradeFeeBps) * 100}%` }} />
              ))}
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {parts.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className={cn('size-2 shrink-0 rounded-[1px]', p.bar)} aria-hidden />
                    {p.label}
                  </span>
                  <span className={cn('font-mono tabular-nums', p.hot ? 'sc-text' : 'text-foreground')}>{bpsToPct(p.bps)}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-4 flex flex-col gap-2 border-t border-[#2c2925] pt-3 text-sm">
              {totals.map((r) => (
                <li key={r.label} className="flex flex-wrap justify-between gap-x-2">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className={cn('font-mono tabular-nums', r.hot ? 'sc-text' : 'text-foreground')}>
                    {formatAmount(r.v)} {q}
                    {quoteUsd && num(r.v) > 0 ? (
                      <span className="ml-1 text-xs text-muted-foreground [text-shadow:none]">({formatUsd(num(r.v) * quoteUsd)})</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Every trade pays {bpsToPct(f.tradeFeeBps)} in {q}:{' '}
              {listJoin(parts.map((p) => `${bpsToPct(p.bps)} to ${p.short}`))}. The same fee applies after graduation on the
              DAMM v2 pool.
              {holders &&
                ` Holders are paid pro-rata to their balance: wallets with a ${q} account receive it automatically; everyone else claims their share anytime from their wallet page.`}
            </p>
          </>
        ) : (
          <div className="h-24 animate-pulse rounded-[2px] bg-muted" />
        )}
      </div>
    </div>
  )
}
