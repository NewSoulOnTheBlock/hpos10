'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { TokenSort, TokenStatus } from '@hpos-pad/shared'
import { Activity, Clock, Flame, Search } from 'lucide-react'
import { HiveIcon, CocoonIcon } from '@/components/sc/icons'
import { motion } from 'framer-motion'
import { useTokenList } from '@/hooks/use-tokens'
import { useLaunchpadConfig, useQuoteSymbol } from '@/hooks/use-config'
import { useDebounce } from '@/hooks/use-debounce'
import { TokenCard, TokenCardSkeleton } from '@/components/token-card'
import { FeaturedCards } from '@/components/featured-cards'
import { EmptyState, ErrorState } from '@/components/states'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const TABS: { id: string; label: string; icon: React.ElementType; sort: TokenSort; status?: TokenStatus }[] = [
  // Default: the token that traded last is first, and moves up live (see RealtimeBridge).
  { id: 'live', label: 'Live', icon: Activity, sort: 'lastTrade' },
  { id: 'new', label: 'New', icon: Clock, sort: 'new', status: 'CURVE' },
  { id: 'trending', label: 'Trending', icon: Flame, sort: 'volume' },
  { id: 'graduating', label: 'About to hatch', icon: CocoonIcon, sort: 'progress', status: 'CURVE' },
  { id: 'graduated', label: 'Hives', icon: HiveIcon, sort: 'mcap', status: 'MIGRATED' },
]

export function TokenBoard() {
  const [tab, setTab] = useState('live')
  const [search, setSearch] = useState('')
  const q = useDebounce(search.trim(), 300)
  const symbol = useQuoteSymbol()
  const { data: config } = useLaunchpadConfig()
  const featured = new Set(config?.featuredMints ?? [])
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]!

  const query = useTokenList({ sort: active.sort, status: q ? undefined : active.status, q: q || undefined })
  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  // Infinite scroll: fetch the next page when the sentinel scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <section className="flex flex-col gap-4">
      <FeaturedCards />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="max-w-full">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                <t.icon /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ticker or mint"
            className="pl-9"
            aria-label="Search tokens"
          />
        </div>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <TokenCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={q ? 'No matches' : 'Nothing here yet'}
          body={q ? `No token matches "${q}".` : 'The pool is empty. Spawn the first token.'}
          action={
            !q && (
              <Button asChild size="sm">
                <Link href="/create">Spawn a token</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((t) => (
              <motion.div key={t.mint} className="min-w-0" layout="position" transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
                <TokenCard token={t} quoteSymbol={symbol} mascot={featured.has(t.mint)} official={config?.officialMint === t.mint} />
              </motion.div>
            ))}
            {isFetchingNextPage && Array.from({ length: 3 }, (_, i) => <TokenCardSkeleton key={`more-${i}`} />)}
          </div>
          <div ref={sentinel} className="h-1" />
        </>
      )}
    </section>
  )
}
