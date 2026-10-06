'use client'

import { quoteDisplaySymbol } from '@/lib/quote-display'

import type { TokenDTO } from '@hpos-pad/shared'
import { ShieldCheck } from 'lucide-react'
import { useTokenReflections } from '@/hooks/use-tokens'
import { useLaunchpadConfig } from '@/hooks/use-config'
import { formatAmount, formatCompact, timeAgo } from '@/lib/format'
import { solscanTx } from '@/lib/solana'
import { ExternalTx } from '@/components/address-link'
import { EmptyState, ErrorState } from '@/components/states'
import { QuoteIcon } from '@/components/quote-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TableSkeleton, TH, THEAD, TR } from './trades-table'

const STATUS_VARIANT = { DONE: 'success', DISTRIBUTING: 'warning', CLAIMED: 'muted', FAILED: 'muted' } as const

/** The reflection ledger: every claim, how it was split, and where it went. */
export function ReflectionsTable({ token }: { token: TokenDTO }) {
  const { data: config } = useLaunchpadConfig()
  const q = quoteDisplaySymbol(config?.quote.symbol)
  const query = useTokenReflections(token.mint)
  const epochs = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="kit-well flex items-start gap-3 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-phosphor" />
        <p className="text-muted-foreground">
          <span className="inline-flex flex-wrap items-center gap-1 font-mono sc-text">
            <QuoteIcon className="size-3.5" />
            {formatCompact(token.reflectedTotalQuote)} {q}
          </span>{' '}
          <span className="text-foreground">reflected to holders so far.</span> Each epoch claims the fees this token
          earned, sends the holder share pro-rata to wallets, and records every transaction here. Unpaid dust carries to
          the next epoch.
        </p>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <TableSkeleton rows={5} />
      ) : epochs.length === 0 ? (
        <EmptyState title="No epochs yet" body="Reflections start after the first fees are claimed." />
      ) : (
        <div className="kit-well overflow-x-auto">
          <table className="w-full min-w-[760px] font-mono text-sm">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>When</th>
                <th className={TH}>Status</th>
                <th className={cn(TH, 'text-right')}>Claimed</th>
                <th className={cn(TH, 'text-right')}>To holders</th>
                <th className={cn(TH, 'text-right')}>Creator</th>
                <th className={cn(TH, 'text-right')}>Platform</th>
                <th className={cn(TH, 'text-right')}>Paid out</th>
                <th className={cn(TH, 'text-right')}>Wallets</th>
                <th className={TH}>Claim tx</th>
              </tr>
            </thead>
            <tbody>
              {epochs.map((e) => (
                <tr key={e.id} className={TR}>
                  <td className="px-3 py-2 text-muted-foreground">{timeAgo(e.createdAt)} ago</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={STATUS_VARIANT[e.status]}
                      className={cn(e.status === 'FAILED' && 'border-destructive/60 bg-destructive/10 text-destructive')}
                    >
                      {e.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAmount(e.claimedQuote)}</td>
                  <td className="px-3 py-2 text-right tabular-nums sc-text">{formatAmount(e.holdersQuote)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatAmount(e.creatorQuote)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatAmount(e.platformQuote)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatAmount(e.distributedQuote)}
                    {Number(e.carriedQuote) > 0 && (
                      <span className="block text-xs text-muted-foreground">+{formatAmount(e.carriedQuote)} carried</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.recipients}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      {e.claimSignatures.slice(0, 2).map((sig) => (
                        <ExternalTx key={sig} href={solscanTx(sig, config?.cluster)} className="text-xs">
                          {sig.slice(0, 8)}…
                        </ExternalTx>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.hasNextPage && (
        <Button variant="subtle" size="sm" className="self-center" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
