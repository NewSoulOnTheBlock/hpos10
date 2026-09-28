'use client'

import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { useToken } from '@/hooks/use-tokens'
import { useTopic } from '@/hooks/use-websocket'
import { useReflectionsOn } from '@/hooks/use-config'
import { ApiError } from '@/lib/api'
import { TokenHeader } from './token-header'
import { McapChart } from './mcap-chart'
import { YourRewards } from './your-rewards'
import { TradePanel } from './trade-panel'
import { CurveCard } from './curve-card'
import { TradesTable } from './trades-table'
import { HoldersTable } from './holders-table'
import { ReflectionsTable } from './reflections-table'
import { TokenAbout } from './token-about'
import { EmptyState, ErrorState } from '@/components/states'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

export function TokenView({ mint }: { mint: string }) {
  const { data: token, isLoading, isError, error, refetch } = useToken(mint)
  const reflections = useReflectionsOn()
  const qc = useQueryClient()

  // Refresh the ledger and holders as soon as a reflection epoch lands.
  useTopic(`token:${mint}`, (e) => {
    if (e.type === 'reflection') {
      void qc.invalidateQueries({ queryKey: ['token-reflections', mint] })
      void qc.invalidateQueries({ queryKey: ['token', mint] })
    }
  })

  if (isLoading) return <TokenSkeleton />
  if (isError || !token) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <EmptyState
          className="mt-8"
          title="Token not found"
          body="If you just launched it, the indexer may still be catching up. This page retries automatically."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/">Back to board</Link>
            </Button>
          }
        />
      )
    }
    return <ErrorState className="mt-8" error={error} onRetry={() => refetch()} />
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1 rounded-[2px] font-display text-[11px] font-bold uppercase tracking-[0.18em] kit-stencil outline-none hover:text-[#f0a818] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" /> Board
      </Link>
      <TokenHeader token={token} />
      {/* DOM order is chart -> trade -> tabs so the trade panel sits right under the chart on mobile. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card
          title="Market Cap Telemetry"
          leds={['blue', 'green']}
          vents
          frameClassName="min-w-0 lg:col-start-1 lg:row-start-1"
          className="p-3 sm:p-5"
        >
          <McapChart token={token} />
        </Card>
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <TradePanel token={token} />
          <CurveCard token={token} />
          {reflections === true && <YourRewards token={token} />}
        </div>
        <Tabs defaultValue="trades" className="min-w-0 lg:col-start-1 lg:row-start-2">
          {/* Capped to the column so it scrolls inside itself instead of widening the page on phones. */}
          <TabsList className="max-w-full" aria-label="Token data">
            <TabsTrigger value="trades" className="px-2 sm:px-3">Trades</TabsTrigger>
            <TabsTrigger value="holders" className="px-2 sm:px-3">Holders</TabsTrigger>
            {reflections === true && (
              <TabsTrigger value="reflections" className="px-2 sm:px-3">Reflections</TabsTrigger>
            )}
            <TabsTrigger value="about" className="px-2 sm:px-3">About</TabsTrigger>
          </TabsList>
          <TabsContent value="trades">
            <Card title="Comms Log" leds={['green']} className="p-3 sm:p-4">
              <TradesTable token={token} />
            </Card>
          </TabsContent>
          <TabsContent value="holders">
            <Card title="Brood" leds={['green']} className="p-3 sm:p-4">
              <HoldersTable token={token} />
            </Card>
          </TabsContent>
          {reflections === true && (
            <TabsContent value="reflections">
              <Card title="Reflection Ledger" leds={['green']} className="p-3 sm:p-4">
                <ReflectionsTable token={token} />
              </Card>
            </TabsContent>
          )}
          <TabsContent value="about">
            <Card title="Intel" leds={['blue']} className="p-3 sm:p-4">
              <TokenAbout token={token} />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

/** Empty kit panels with a dim, pulsing screen while the token loads. */
function SkeletonConsole({ className }: { className: string }) {
  return (
    <div className="kit-panel">
      <div className={`kit-screen animate-pulse bg-[#0a0907] ${className}`} />
    </div>
  )
}

function TokenSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading token">
      <SkeletonConsole className="h-32" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SkeletonConsole className="h-[460px]" />
        <SkeletonConsole className="h-[460px]" />
      </div>
    </div>
  )
}
