'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import { useLaunchpadConfig } from '@/hooks/use-config'
import { QuoteIcon } from '@/components/quote-icon'
import { bpsToPct } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Where every trade's fee goes, read live from /config so it never drifts from the service. */
export function FeeBreakdown() {
  const { data: config, isLoading } = useLaunchpadConfig()
  if (isLoading || !config) return <div className="kit-well h-40 animate-pulse" />
  const f = config.fees
  const reflectionsOn = f.reflectionBps > 0
  const rows = [
    { label: 'Token creator', bps: f.creatorBps, bar: 'bg-sonic shadow-[0_0_8px_rgb(0_124_240/0.6)]', text: 'kit-cyan' },
    { label: 'Holders (reflections)', bps: f.reflectionBps, bar: 'bg-phosphor shadow-glow-sm', text: 'sc-text' },
    { label: 'Platform', bps: f.platformBps, bar: 'bg-cyan/80 shadow-[0_0_8px_rgb(47_155_255/0.5)]', text: 'kit-amber' },
    { label: 'Meteora protocol', bps: f.protocolBps, bar: 'bg-steel-light', text: 'text-foreground' },
  ].filter((r) => r.bps > 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Every trade</p>
          <p className="flex flex-wrap items-center gap-x-2 font-display text-2xl font-extrabold uppercase tracking-wide">
            <span className="font-mono sc-text">{bpsToPct(f.tradeFeeBps)}</span>
            <span className="text-foreground">fee in</span>
            <span className="inline-flex items-center gap-1.5 font-mono kit-cyan">
              <QuoteIcon className="size-5" />
              {quoteDisplaySymbol(config.quote.symbol)}
            </span>
          </p>
        </div>
        <p className="font-mono text-xs text-muted-foreground">buys &amp; sells · curve &amp; DAMM v2</p>
      </div>

      <div className="kit-well flex h-5 gap-px overflow-hidden p-[3px]" role="img" aria-label="Fee split">
        {rows.map((r) => (
          <div key={r.label} className={cn('h-full rounded-[1px]', r.bar)} style={{ width: `${(r.bps / f.tradeFeeBps) * 100}%` }} />
        ))}
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.label} className="kit-well flex items-center gap-2 px-3 py-2 text-sm">
            <span className={cn('size-2.5 shrink-0 rounded-[1px]', r.bar)} />
            <span className="min-w-0 truncate text-muted-foreground">{r.label}</span>
            <span className={cn('ml-auto font-mono font-semibold', r.text)}>{bpsToPct(r.bps)}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Meteora&apos;s program always keeps 20% of the fee. The creator share goes to the wallet that spawned the token.
        {reflectionsOn ? (
          <>
            {' '}
            Holders receive <span className="font-mono sc-text">{bpsToPct(f.reflectionBps)}</span> of every trade,
            paid pro-rata to their wallets.
          </>
        ) : (
          <> Holder reflections are off: nothing is paid to holders unless the operator switches them on.</>
        )}
      </p>
    </div>
  )
}
