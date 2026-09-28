'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import type { TokenDTO } from '@hpos-pad/shared'
import { Card } from '@/components/ui/card'
import { useLaunchpadConfig, useReflectionsOn } from '@/hooks/use-config'
import { useTokenBalance } from '@/hooks/use-token-balance'
import { useWalletEarnings } from '@/hooks/use-wallet-data'
import { formatAmount, formatUsd, num, timeAgo } from '@/lib/format'
import { QuoteIcon } from '@/components/quote-icon'
import { ClaimPanel } from '@/components/claim-panel'

/**
 * What the connected wallet has earned from this token. Reflections are
 * pushed to holders automatically, so there is nothing to claim; this is a
 * receipt, not a button. Hidden entirely while reflections are off.
 */
export function YourRewards({ token }: { token: TokenDTO }) {
  const { publicKey } = useWallet()
  const owner = publicKey?.toBase58()
  const { data: config } = useLaunchpadConfig()
  const reflections = useReflectionsOn()
  const { data, isLoading } = useWalletEarnings(owner, token.mint)
  const { data: balance } = useTokenBalance(token.mint)
  if (!owner || reflections !== true) return null

  const q = config?.quote.symbol ?? 'HPOS10I'
  const row = data?.tokens[0]
  const earned = row?.totalQuote ?? '0'
  const quoteUsd = token.priceUsd && token.priceQuote ? token.priceUsd / token.priceQuote : null
  const holds = (balance?.ui ?? 0) > 0
  const share = config ? config.fees.reflectionBps / 100 : null

  return (
    <Card title="Your Rewards" leds={['green']} className="flex flex-col gap-2 p-4">
      {isLoading ? (
        <div className="h-8 w-40 animate-pulse rounded-[2px] bg-muted" />
      ) : (
        <div className="kit-well flex flex-wrap items-baseline justify-between gap-x-2 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-2xl tabular-nums sc-text">
            <QuoteIcon className="size-4" />
            {formatAmount(earned)} {q}
          </span>
          {quoteUsd && num(earned) > 0 && <span className="font-mono text-xs text-muted-foreground">≈ {formatUsd(num(earned) * quoteUsd)}</span>}
        </div>
      )}
      <ClaimPanel address={owner} quoteUsd={quoteUsd} className="mt-1" />
      <p className="text-sm text-muted-foreground">
        {row
          ? `Earned from $${token.symbol} across ${row.payouts} payout${row.payouts === 1 ? '' : 's'}, last ${timeAgo(row.lastPaidAt)} ago. Sent to your wallet automatically.`
          : holds
            ? `You hold $${token.symbol}. Your share of every trade${share ? ` (${share}% of volume, split by holdings)` : ''} arrives in ${q} automatically at the next payout.`
            : `Hold $${token.symbol} to earn ${share ? `${share}% of every trade` : 'a share of every trade'} in ${q}, paid automatically.`}
      </p>
    </Card>
  )
}
