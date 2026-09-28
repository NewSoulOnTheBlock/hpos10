import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HiveScene } from '@/components/creep/hive-scene'
import { QuoteIcon } from '@/components/quote-icon'
import { LarvaIcon } from '@/components/sc/icons'
import { SprotoStrip } from '@/components/sproto-strip'
import { TradeTicker } from '@/components/trade-ticker'
import { TokenBoard } from '@/components/token-board'

export const metadata: Metadata = { title: 'The swarm' }

/** The swarm: every token as a list, for those who hide the creep. */
export default function BoardPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-6">
      <Card title="Hatchery // Status" leds={['blue', 'green', 'green']} vents keys className="overflow-hidden">
        <div className="grid items-center gap-4 p-5 sm:p-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative z-10 flex flex-col gap-4">
            <p className="font-mono text-sm sc-text">&gt; spawning pool online_</p>
            <h1 className="max-w-xl kit-title text-3xl leading-[1.05] sm:text-5xl">
              Spawn a token.
              <br />
              <span className="text-[#ffd98a]">Feed on every trade.</span>
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              Launch on a bonding curve in one transaction. As creator you earn a cut of every trade your token makes,
              before and after it graduates.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/create">
                  <LarvaIcon /> Spawn a token
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/docs">
                  <BookOpen /> How it works
                </Link>
              </Button>
            </div>
            <p className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
              <QuoteIcon className="size-5" /> Every token trades against <span className="kit-cyan">$HPOS10I</span>
            </p>
          </div>
          <HiveScene className="mx-auto max-w-md" />
        </div>
      </Card>
      <SprotoStrip />
      <TradeTicker />
      <TokenBoard />
    </div>
  )
}
