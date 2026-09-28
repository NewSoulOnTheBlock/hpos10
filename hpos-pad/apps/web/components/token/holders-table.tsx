'use client'

import type { TokenDTO } from '@hpos-pad/shared'
import { useHolders } from '@/hooks/use-tokens'
import { formatCompact } from '@/lib/format'
import { WalletLink } from '@/components/address-link'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TableSkeleton, TH, THEAD, TR } from './trades-table'

/** The brood: top holders and their share of supply. */
export function HoldersTable({ token }: { token: TokenDTO }) {
  const { data, isLoading, isError, error, refetch } = useHolders(token.mint)
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isLoading) return <TableSkeleton />
  if (!data || data.length === 0) return <EmptyState title="No holders yet" />

  return (
    <div className="kit-well overflow-x-auto">
      <table className="w-full min-w-[480px] font-mono text-sm">
        <thead className={THEAD}>
          <tr>
            <th className={cn(TH, 'w-10')}>#</th>
            <th className={TH}>Holder</th>
            <th className={cn(TH, 'text-right')}>{token.symbol}</th>
            <th className={cn(TH, 'w-2/5')}>Share</th>
          </tr>
        </thead>
        <tbody>
          {data.map((h, i) => (
            <tr key={h.owner} className={TR}>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{String(i + 1).padStart(2, '0')}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <WalletLink address={h.owner} />
                  {h.label && <Badge variant="muted">{h.label}</Badge>}
                  {h.owner === token.creator && <Badge variant="sonic">Dev</Badge>}
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCompact(h.amount)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="kit-well h-2 flex-1 overflow-hidden rounded-[1px]">
                    <div
                      className="h-full bg-phosphor shadow-[0_0_8px_rgb(61_255_106/0.6)]"
                      style={{ width: `${Math.min(100, h.share * 100)}%` }}
                    />
                  </div>
                  <span className="w-14 text-right tabular-nums text-phosphor-bright">{(h.share * 100).toFixed(2)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
