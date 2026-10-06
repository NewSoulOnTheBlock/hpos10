'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import type { TokenDTO } from '@hpos-pad/shared'
import { Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { StageBadge } from '@/components/stage-badge'
import { QuoteIcon } from '@/components/quote-icon'
import { useLaunchpadConfig, useReflectionsOn } from '@/hooks/use-config'
import { stageOf } from '@/lib/evolution'
import { formatCompact, formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

/** The five stages in order, read from the same mapping the badges use. */
const LADDER = [
  stageOf('CURVE', 0),
  stageOf('CURVE', 0.34),
  stageOf('CURVE', 0.67),
  stageOf('COMPLETE', 1),
  stageOf('MIGRATED', 1),
]

/**
 * Bonding-curve progress told as the brood's evolution. The stage is only a
 * label: the true fill % and the raised / target amounts are always shown.
 */
export function CurveCard({ token }: { token: TokenDTO }) {
  const { data: config } = useLaunchpadConfig()
  const reflections = useReflectionsOn()
  const q = quoteDisplaySymbol(config?.quote.symbol)
  // Every amount on the wire is a decimal string in UI units.
  const threshold = config ? Number(config.curve.migrationQuoteThreshold) : null
  const reserve = Number(token.quoteReserve)
  const quoteUsd = token.priceUsd && token.priceQuote ? token.priceUsd / token.priceQuote : null
  const stage = stageOf(token.status, token.progress)
  const current = LADDER.findIndex((s) => s.id === stage.id)

  const ladder = (
    <ol className="grid grid-cols-5 gap-1" aria-label="Evolution stages">
      {LADDER.map((s, i) => (
        <li
          key={s.id}
          aria-current={i === current ? 'step' : undefined}
          className={cn(
            'kit-well flex flex-col items-center gap-0.5 px-0.5 py-1 text-center',
            i === current && 'border-phosphor/60 shadow-[inset_0_0_10px_rgb(61_255_106/0.2)]',
          )}
        >
          <span className={cn('font-mono text-[10px]', i <= current ? 'sc-text' : 'text-muted-foreground/60')}>{s.tier}</span>
          <span
            className={cn(
              'w-full truncate font-display text-[8px] font-bold uppercase tracking-[0.06em] sm:text-[9px]',
              i === current ? 'text-foreground' : 'text-muted-foreground/70',
            )}
          >
            {s.name}
          </span>
        </li>
      ))}
    </ol>
  )

  if (token.status === 'MIGRATED') {
    return (
      <Card title="Evolution" leds={['green']} className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <StageBadge status={token.status} progress={token.progress} />
          <span className="inline-flex items-center gap-1 font-display text-[10px] font-bold uppercase tracking-[0.16em] sc-text">
            <Lock className="size-3.5" /> LP locked
          </span>
        </div>
        {ladder}
        <p className="text-sm text-muted-foreground">
          The curve filled and migrated to a Meteora DAMM v2 pool. Its liquidity is permanently locked, and the same fee
          keeps paying {reflections ? 'reflections to holders' : 'the creator and the platform'}.
        </p>
        {token.dammPool && <p className="kit-well break-all px-2 py-1.5 font-mono text-xs text-muted-foreground">POOL {token.dammPool}</p>}
      </Card>
    )
  }

  return (
    <Card title="Evolution" leds={[token.status === 'COMPLETE' ? 'amber' : 'green']} className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <StageBadge status={token.status} progress={token.progress} />
        <span className="font-mono text-2xl tabular-nums sc-text">{(token.progress * 100).toFixed(1)}%</span>
      </div>
      <Progress value={token.progress} className="h-2.5" aria-label="Bonding curve progress" />
      <div className="flex items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.16em]">Raised</span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <QuoteIcon className="size-3.5" />
          <span className="text-phosphor-bright">{formatCompact(reserve)}</span> / {threshold !== null ? formatCompact(threshold) : '…'} {q}
        </span>
      </div>
      {ladder}
      <p className="text-sm text-muted-foreground">
        {token.status === 'COMPLETE'
          ? 'The curve is full. Migration to DAMM v2 runs automatically.'
          : threshold !== null
            ? `Hatches into a DAMM v2 pool once ${formatCompact(threshold)} ${q}${quoteUsd ? ` (~${formatUsd(threshold * quoteUsd)})` : ''} is raised. LP is locked forever.`
            : 'Hatches into a DAMM v2 pool when the curve fills. LP is locked forever.'}
      </p>
    </Card>
  )
}
