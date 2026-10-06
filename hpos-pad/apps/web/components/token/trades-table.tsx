'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import type { TokenDTO } from '@hpos-pad/shared'
import { useTokenTrades } from '@/hooks/use-tokens'
import { useLaunchpadConfig } from '@/hooks/use-config'
import { formatAmount, formatCompact, formatPrice, timeAgo } from '@/lib/format'
import { solscanTx } from '@/lib/solana'
import { WalletLink, ExternalTx } from '@/components/address-link'
import { EmptyState, ErrorState } from '@/components/states'
import { QuoteIcon } from '@/components/quote-icon'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Shared table chrome: stencilled header row on steel, mono readout rows. */
export const TH = 'px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.16em] kit-stencil'
export const THEAD = 'bg-[linear-gradient(180deg,#252b2c,#1b2021)] text-left'
export const TR = 'border-t border-[#2c2925] transition-colors hover:bg-phosphor/5'

/** The token's comms log: every buy and sell, newest first. */
export function TradesTable({ token }: { token: TokenDTO }) {
  const { data: config } = useLaunchpadConfig()
  const q = quoteDisplaySymbol(config?.quote.symbol)
  const query = useTokenTrades(token.mint)
  const trades = query.data?.pages.flatMap((p) => p.items) ?? []

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.isLoading) return <TableSkeleton />
  if (trades.length === 0) return <EmptyState title="No trades yet" body="Be the first buyer on the curve." />

  return (
    <div className="flex flex-col gap-3">
      <div className="kit-well overflow-x-auto">
        <table className="w-full font-mono text-xs sm:min-w-[620px] sm:text-sm">
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Trader</th>
              <th className={TH}>Side</th>
              <th className={cn(TH, 'text-right')}>
                <span className="inline-flex items-center gap-1">
                  <QuoteIcon className="size-3.5" /> {q}
                </span>
              </th>
              {/* Phones: trader, side, quote and age only. */}
              <th className={cn(TH, 'hidden text-right sm:table-cell')}>{token.symbol}</th>
              <th className={cn(TH, 'hidden text-right sm:table-cell')}>Price</th>
              <th className={cn(TH, 'text-right')}>Age</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={`${t.signature}-${t.side}-${t.baseAmount}`} className={cn('animate-flash', TR)}>
                <td className="px-3 py-2">
                  <WalletLink address={t.trader} />
                </td>
                <td
                  className={cn(
                    'px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.14em]',
                    t.side === 'BUY' ? 'text-success' : 'text-destructive',
                  )}
                >
                  {t.side === 'BUY' ? 'Buy' : 'Sell'}
                </td>
                <td className={cn('px-3 py-2 text-right tabular-nums', t.side === 'BUY' ? 'text-phosphor-bright' : 'text-foreground')}>
                  {formatAmount(t.quoteAmount)}
                </td>
                <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{formatCompact(t.baseAmount)}</td>
                <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{formatPrice(t.priceQuote)}</td>
                <td className="px-3 py-2 text-right">
                  <ExternalTx href={solscanTx(t.signature, config?.cluster)}>{timeAgo(t.blockTime)}</ExternalTx>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.hasNextPage && (
        <Button variant="subtle" size="sm" className="self-center" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  )
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="kit-well flex flex-col gap-2 p-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  )
}
