'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { ExternalLink } from 'lucide-react'
import { useWalletEarnings, useWalletReflections, useWalletTrades } from '@/hooks/use-wallet-data'
import { useLaunchpadConfig, useReflectionsOn } from '@/hooks/use-config'
import { formatAmount, formatCompact, formatUsd, num, shortAddress, timeAgo } from '@/lib/format'
import { solscanAccount, solscanTx } from '@/lib/solana'
import { CopyButton } from '@/components/copy-button'
import { ExternalTx } from '@/components/address-link'
import { SprotoAvatar } from '@/components/sproto-avatar'
import { EmptyState, ErrorState } from '@/components/states'
import { TableSkeleton } from '@/components/token/trades-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LarvaIcon } from '@/components/sc/icons'
import { useStats } from '@/hooks/use-tokens'
import { cn } from '@/lib/utils'
import { QuoteIcon } from '@/components/quote-icon'
import { ClaimPanel } from '@/components/claim-panel'

const thClass = 'px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.14em] kit-stencil'

/**
 * A wallet's earnings. With reflections off (the default) the page is about
 * creator earnings; with them on it leads with reflections received as a
 * holder, plus the creator share and payout history.
 */
export function WalletView({ address }: { address: string }) {
  const { publicKey } = useWallet()
  const { data: config } = useLaunchpadConfig()
  const { data: stats } = useStats()
  const reflectionsOn = useReflectionsOn()
  const q = config?.quote.symbol ?? 'HPOS10I'
  const isMe = publicKey?.toBase58() === address
  const reflections = useWalletReflections(address)
  const total = reflections.data?.pages[0]?.totalQuote ?? '0'
  const payouts = reflections.data?.pages.flatMap((p) => p.items) ?? []
  const earnings = useWalletEarnings(address)
  const quoteUsd = stats?.quoteUsd ?? null
  const created = earnings.data?.created ?? []
  const creatorTotal = earnings.data?.creatorTotalQuote ?? '0'

  const heading = reflectionsOn === false ? 'Creator earnings' : isMe ? 'My rewards' : 'Wallet'

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex items-center gap-4 sm:gap-5">
        <SprotoAvatar address={address} title="Sproto avatar for this wallet" className="size-20 sm:size-24" />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-mono text-sm sc-text">&gt; wallet uplink established_</p>
          <h1 className="kit-title text-2xl sm:text-3xl">{heading}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <CopyButton value={address} label={shortAddress(address, 6)} />
            <a
              href={solscanAccount(address, config?.cluster)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-[2px] font-display text-[11px] font-bold uppercase tracking-[0.14em] outline-none hover:text-[#f0a818] focus-visible:ring-2 focus-visible:ring-ring"
            >
              Solscan <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>

      {reflectionsOn === undefined ? (
        <Hero title="Earnings" label="Loading" loading />
      ) : reflectionsOn ? (
        <Hero
          title="Reflections"
          label="Total reflections received"
          loading={reflections.isLoading}
          amount={total}
          q={q}
          quoteUsd={quoteUsd}
        />
      ) : (
        <Hero
          title="Creator earnings"
          label="Total earned as creator"
          loading={earnings.isLoading}
          amount={creatorTotal}
          q={q}
          quoteUsd={quoteUsd}
          footer={
            config && config.fees.creatorBps > 0 ? (
              <>
                &gt; {config.fees.creatorBps / 100}% of every trade on tokens {isMe ? 'you spawn' : 'this wallet spawned'}, sent
                automatically
              </>
            ) : null
          }
        />
      )}

      {reflectionsOn && <ClaimPanel address={address} quoteUsd={quoteUsd} />}

      {reflectionsOn === false ? (
        <Card title="Spawned tokens" leds={['green']} className="p-3 sm:p-4">
          {earnings.isError ? (
            <ErrorState error={earnings.error} onRetry={() => earnings.refetch()} />
          ) : earnings.isLoading ? (
            <TableSkeleton rows={3} />
          ) : created.length === 0 ? (
            <EmptyState
              title="No tokens spawned yet"
              body={`Spawn a token and ${config && config.fees.creatorBps > 0 ? `${config.fees.creatorBps / 100}% ` : 'a share '}of every trade on it is sent here in ${q}.`}
              action={
                isMe ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/create">
                      <LarvaIcon /> Spawn a token
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TokenList
              items={created.map((t) => ({ ...t, sub: 'creator share' }))} q={q} quoteUsd={quoteUsd} />
          )}
        </Card>
      ) : (
        reflectionsOn &&
        created.length > 0 && (
          <Card title="Earned as creator" leds={['green']} className="flex flex-col gap-3 p-3 sm:p-4">
            <p className="flex flex-wrap items-baseline justify-between gap-x-2 px-1 font-mono">
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.16em] kit-stencil">Total</span>
              <span className="sc-text">
                {formatAmount(creatorTotal)} {q}
                {quoteUsd ? <span className="ml-1 text-xs text-muted-foreground [text-shadow:none]">({formatUsd(num(creatorTotal) * quoteUsd)})</span> : null}
              </span>
            </p>
            <TokenList items={created.map((t) => ({ ...t, sub: 'creator share' }))} q={q} quoteUsd={quoteUsd} />
          </Card>
        )
      )}

      {reflectionsOn && (earnings.data?.tokens.length ?? 0) > 0 && (
        <Card title="Earned by token" leds={['blue']} className="p-3 sm:p-4">
          <TokenList
            items={earnings.data!.tokens.map((t) => ({
              ...t,
              sub: `${t.payouts} payout${t.payouts === 1 ? '' : 's'} · last ${timeAgo(t.lastPaidAt)} ago`,
            }))}
            q={q}
            quoteUsd={quoteUsd}
          />
        </Card>
      )}

      {reflectionsOn ? (
        <Card title="Logs" leds={['blue', 'green']} className="p-3 sm:p-4">
          <Tabs defaultValue="rewards">
            <TabsList>
              <TabsTrigger value="rewards">Reflections</TabsTrigger>
              <TabsTrigger value="trades">Trades</TabsTrigger>
            </TabsList>
            <TabsContent value="rewards">
              {reflections.isError ? (
                <ErrorState error={reflections.error} onRetry={() => reflections.refetch()} />
              ) : reflections.isLoading ? (
                <TableSkeleton />
              ) : payouts.length === 0 ? (
                <EmptyState
                  title="No reflections yet"
                  body={`Hold any Hatchery token and your share of every trade is sent here in ${q}.`}
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link href="/">Browse tokens</Link>
                    </Button>
                  }
                />
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="kit-well overflow-x-auto">
                    <table className="w-full min-w-[480px] font-mono text-sm">
                      <thead className="border-b border-steel-light/40 text-left">
                        <tr>
                          <th className={thClass}>Token</th>
                          <th className={cn(thClass, 'text-right')}>Amount</th>
                          <th className={cn(thClass, 'text-right')}>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payouts.map((p) => (
                          <tr key={`${p.epochId}-${p.owner}`} className="border-t border-border/50 hover:bg-phosphor/5">
                            <td className="px-3 py-2">
                              <Link href={`/token/${p.mint}`} className="kit-cyan hover:underline">
                                ${p.symbol}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums sc-text">
                              +{formatAmount(p.amountQuote)} {q}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {p.signature ? (
                                <ExternalTx href={solscanTx(p.signature, config?.cluster)}>{timeAgo(p.createdAt)}</ExternalTx>
                              ) : (
                                <span className="text-muted-foreground">{timeAgo(p.createdAt)}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {reflections.hasNextPage && (
                    <Button variant="subtle" size="sm" className="self-center" onClick={() => reflections.fetchNextPage()}>
                      Load more
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
            <TabsContent value="trades">
              <WalletTrades address={address} quoteSymbol={q} cluster={config?.cluster} />
            </TabsContent>
          </Tabs>
        </Card>
      ) : (
        <Card title="Trade log" leds={['blue']} className="p-3 sm:p-4">
          <WalletTrades address={address} quoteSymbol={q} cluster={config?.cluster} />
        </Card>
      )}
    </div>
  )
}

/** The headline readout: one big quote amount in a recessed well. */
function Hero({
  title,
  label,
  loading,
  amount = '0',
  q,
  quoteUsd,
  footer,
}: {
  title: string
  label: string
  loading: boolean
  amount?: string
  q?: string
  quoteUsd?: number | null
  footer?: ReactNode
}) {
  return (
    <Card title={title} leds={['green', 'green']} vents keys className="p-4 sm:p-5">
      <div className="kit-well relative overflow-hidden p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(61_255_106/0.12),transparent_60%)]" />
        <p className="relative flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.16em] kit-stencil">
          <QuoteIcon className="size-3.5" /> {label}
        </p>
        {loading ? (
          <div className="relative mt-2 h-9 w-48 max-w-full animate-pulse rounded-[2px] bg-muted" />
        ) : (
          <p className="relative mt-1 flex flex-wrap items-baseline gap-x-2 break-all font-mono text-3xl sc-text sm:text-4xl">
            {formatAmount(amount)} <span className="text-lg sm:text-xl">{q}</span>
          </p>
        )}
        <p className="relative h-5 font-mono text-sm text-muted-foreground">
          {!loading && quoteUsd ? `≈ ${formatUsd(num(amount) * quoteUsd)}` : ''}
        </p>
      </div>
      {footer && <p className="mt-3 font-mono text-xs text-muted-foreground">{footer}</p>}
    </Card>
  )
}

type TokenRow = { mint: string; symbol: string; name: string; imageUrl: string | null; totalQuote: string; sub: string }

function TokenList({ items, q, quoteUsd }: { items: TokenRow[]; q: string; quoteUsd: number | null }) {
  return (
    <ul className="kit-well divide-y divide-border/50">
      {items.map((t) => (
        <li key={t.mint}>
          <Link
            href={`/token/${t.mint}`}
            className="flex items-center gap-3 px-3 py-3 outline-none transition-colors hover:bg-phosphor/5 focus-visible:bg-cyan/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {t.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.imageUrl} alt="" loading="lazy" className="size-9 shrink-0 rounded-[3px] border border-steel-light object-cover" />
            ) : (
              <div className="grid size-9 shrink-0 place-items-center rounded-[3px] border border-steel-light bg-muted font-display text-xs kit-cyan">
                {t.symbol.slice(0, 2)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold uppercase tracking-wide">{t.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                <span className="kit-cyan">${t.symbol}</span> · {t.sub}
              </p>
            </div>
            <div className="shrink-0 text-right font-mono">
              <p className="text-sm sc-text">
                {formatAmount(t.totalQuote)} <span className="text-xs">{q}</span>
              </p>
              {quoteUsd ? <p className="text-xs text-muted-foreground">{formatUsd(num(t.totalQuote) * quoteUsd)}</p> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function WalletTrades({ address, quoteSymbol, cluster }: { address: string; quoteSymbol: string; cluster?: 'mainnet-beta' | 'devnet' }) {
  const query = useWalletTrades(address)
  const trades = query.data?.pages.flatMap((p) => p.items) ?? []
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.isLoading) return <TableSkeleton />
  if (trades.length === 0) return <EmptyState title="No trades yet" />
  return (
    <div className="flex flex-col gap-3">
      <div className="kit-well overflow-x-auto">
        <table className="w-full min-w-[520px] font-mono text-sm">
          <thead className="border-b border-steel-light/40 text-left">
            <tr>
              <th className={thClass}>Token</th>
              <th className={thClass}>Side</th>
              <th className={cn(thClass, 'text-right')}>
                <span className="inline-flex items-center gap-1">
                  <QuoteIcon className="size-3" /> {quoteSymbol}
                </span>
              </th>
              <th className={cn(thClass, 'text-right')}>Tokens</th>
              <th className={cn(thClass, 'text-right')}>When</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={`${t.signature}-${t.side}-${t.baseAmount}`} className="border-t border-border/50 hover:bg-phosphor/5">
                <td className="px-3 py-2">
                  <Link href={`/token/${t.mint}`} className="kit-cyan hover:underline">
                    ${t.symbol}
                  </Link>
                </td>
                <td
                  className={cn(
                    'px-3 py-2 font-display text-[11px] font-bold uppercase tracking-[0.12em]',
                    t.side === 'BUY' ? 'text-success' : 'text-destructive',
                  )}
                >
                  {t.side === 'BUY' ? 'Buy' : 'Sell'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(t.quoteAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCompact(t.baseAmount)}</td>
                <td className="px-3 py-2 text-right">
                  <ExternalTx href={solscanTx(t.signature, cluster)}>{timeAgo(t.blockTime)}</ExternalTx>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.hasNextPage && (
        <Button variant="subtle" size="sm" className="self-center" onClick={() => query.fetchNextPage()}>
          Load more
        </Button>
      )}
    </div>
  )
}
