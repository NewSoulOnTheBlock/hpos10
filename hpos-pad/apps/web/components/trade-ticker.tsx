'use client'

import Link from 'next/link'
import { useRecentTrades } from '@/hooks/use-tokens'
import { useQuoteSymbol } from '@/hooks/use-config'
import { useRealtimeStatus } from '@/hooks/use-websocket'
import { formatCompact, shortAddress } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SprotoAvatar } from '@/components/sproto-avatar'

/** Scrolling comms log of the latest trades across every token. */
export function TradeTicker() {
  const { data } = useRecentTrades()
  const connected = useRealtimeStatus()
  const symbol = useQuoteSymbol()
  const trades = data ?? []

  return (
    <div className="kit-well relative flex h-10 items-center overflow-hidden">
      <div className="z-10 flex h-full shrink-0 items-center gap-2 border-r border-[#2c2925] bg-[linear-gradient(180deg,#1c1b1a,#0b0b0b)] px-3">
        <span className={cn('led', connected ? 'on-green animate-pulse-dot' : '')} />
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] kit-stencil">Comms</span>
      </div>
      {trades.length === 0 ? (
        <p className="px-4 font-mono text-sm text-muted-foreground">&gt; awaiting first transmission…</p>
      ) : (
        <div className="ticker-track flex w-max gap-8 whitespace-nowrap px-4 font-mono text-sm">
          {[...trades, ...trades].map((t, i) => (
            <Link key={`${t.signature}-${i}`} href={`/token/${t.mint}`} className="flex items-center gap-2 hover:brightness-125">
              <SprotoAvatar address={t.trader} className="size-5" />
              <span className="text-cyan">[{shortAddress(t.trader)}]:</span>
              <span className={t.side === 'BUY' ? 'sc-text' : 'text-destructive'}>{t.side === 'BUY' ? 'bought' : 'sold'}</span>
              <span className="text-foreground">
                {formatCompact(t.quoteAmount)} {symbol}
              </span>
              <span className="text-muted-foreground">of</span>
              <span className="kit-cyan">${t.symbol}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
