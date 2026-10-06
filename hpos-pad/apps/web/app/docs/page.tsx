import type { Metadata } from 'next'
import Link from 'next/link'
import { Code2, LayoutGrid } from 'lucide-react'
import { FeeBreakdown } from '@/components/docs/fee-breakdown'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CocoonIcon, HiveIcon, LarvaIcon } from '@/components/sc/icons'
import { MOB_LABEL, MOB_TIERS, stageOf, type Stage } from '@/lib/evolution'
import { MobSprite } from '@/components/creep/sprites'
import { formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'How it works',
  description: 'How The Hatchery works: spawning a token, the bonding curve, fees, evolution stages and graduation to Meteora DAMM v2.',
}

const SECTIONS = [
  {
    title: 'Spawn',
    body: 'Fill in a name, ticker, image and links. One transaction creates the token and its Meteora Dynamic Bonding Curve pool, optionally with your own first buy so nobody gets in ahead of you. Mint addresses come from a vanity pool and end in "hpos". Supply is fixed at 1 billion, there is no mint authority, and metadata is immutable.',
  },
  {
    title: 'The bonding curve',
    body: 'Price rises as people buy and falls as they sell, along a curve defined by the launchpad config. Every token spawned here uses the same config, so every curve plays by the same rules. Progress shows how much of the graduation threshold (migrationQuoteThreshold in /config) has been raised in the quote token.',
  },
  {
    title: 'Paying in SOL or the quote token',
    body: 'Curves are priced in the quote token, $BITCOIN. You can pay with SOL: a Jupiter SOL to $BITCOIN swap runs inside the same transaction as the curve buy. Or pay in $BITCOIN directly. Sells can pay out in either.',
  },
  {
    title: 'Fees',
    body: 'Every buy and sell pays the trading fee shown above, in the quote token. Meteora keeps its fixed protocol share; the platform claims the rest every few minutes and sends the creator share straight to the wallet that spawned the token, and the platform share to the treasury. Every claim is published on the token page with its transactions. Holder reflections exist but are off by default; if the operator turns them on, holders are paid pro-rata from the same claim.',
  },
  {
    title: 'Graduation',
    body: 'When the curve fills, the pool migrates to a Meteora DAMM v2 pool automatically. The liquidity is permanently locked. The same fee applies on the DAMM v2 pool and the split stays identical, so creators keep earning. After graduation, trades route through Jupiter.',
  },
  {
    title: 'Risks',
    body: 'These tokens are created by anyone and are highly speculative. Creator earnings only exist when people trade, so they can be zero. Nothing here is a promise of profit. Check the contract address, and never trade more than you can afford to lose.',
  },
]

/** Representative inputs for each stage, run through the real mapping so the docs can't drift from it. */
const STAGES: { stage: Stage; Icon: typeof LarvaIcon }[] = [
  { stage: stageOf('CURVE', 0), Icon: LarvaIcon },
  { stage: stageOf('CURVE', 0.5), Icon: CocoonIcon },
  { stage: stageOf('CURVE', 0.8), Icon: CocoonIcon },
  { stage: stageOf('COMPLETE', 1), Icon: CocoonIcon },
  { stage: stageOf('MIGRATED', 1), Icon: HiveIcon },
]

export default function DocsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Card title="Field Manual" leds={['blue', 'green']} className="p-5 sm:p-6">
        <p className="font-mono text-sm sc-text">&gt; briefing loaded_</p>
        <h1 className="mt-2 kit-title text-2xl sm:text-3xl">
          How <span className="text-[#ffd98a]">The Hatchery</span> works
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          A token launchpad on Meteora&apos;s Dynamic Bonding Curve, quoted in $BITCOIN on Solana. Spawn a token in one
          transaction and, as its creator, earn a cut of every trade it makes, before and after it graduates.
        </p>
      </Card>

      <Card title="Fee Routing" leds={['green']} className="p-5">
        <FeeBreakdown />
      </Card>

      <Card title="Operations" leds={['blue', 'green', 'amber']} className="p-5 sm:p-6">
        <ol className="flex flex-col gap-6">
          {SECTIONS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="font-mono text-2xl font-bold sc-text">{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold uppercase tracking-[0.12em] text-foreground">{s.title}</h2>
                <p className="mt-1.5 leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Brood Evolution" leds={['amber']} className="p-5 sm:p-6">
        <p className="leading-relaxed text-muted-foreground">
          Every token wears an evolution stage. It is only a label over real on-chain state: the stage is derived from the
          curve&apos;s actual progress and status, never the other way round, so it can&apos;t overstate how close a token
          is to graduating.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {STAGES.map(({ stage, Icon }) => (
            <li key={stage.id} className="kit-well flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
              <span
                className={cn(
                  'inline-flex w-36 shrink-0 self-start items-center sm:self-auto gap-1.5 rounded-[2px] border px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.12em]',
                  stage.tone,
                )}
              >
                <Icon className="size-4" />
                <span className="font-mono opacity-70">{stage.tier}</span>
                {stage.name}
              </span>
              <span className="min-w-0 text-sm text-muted-foreground">{stage.hint}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 leading-relaxed text-muted-foreground">
          On the creep a token is a mob: a larva under 10% of the curve, an egg after that, and a hatchling once it
          graduates. From there it grows with its market cap, as long as enough holders back it:
        </p>
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[...MOB_TIERS].reverse().map((t) => (
            <li key={t.mob} className="kit-well flex flex-col items-center gap-1 px-2 py-2 text-center">
              <span className="flex h-20 items-end">
                <MobSprite mob={t.mob} className="w-14" />
              </span>
              <span className="font-display text-xs font-bold uppercase tracking-[0.1em] kit-amber">{MOB_LABEL[t.mob]}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {t.minUsd ? `≥ ${formatUsd(t.minUsd)}` : 'graduated'}
                {t.minHolders > 0 && <span className="block">{t.minHolders}+ holders</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-5 leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Dead</strong> means no trades for a day; one trade revives it.{' '}
          <strong className="text-[#ff4a3d]">Rugged</strong> is final and only for a graduated token that had real
          traction (at least 15 holders and a day over $8k volume), whose creator then sold more than half their bag,
          after which it collapsed (6 hours without a trade, or 70% below its high). Coins still on the curve are never
          marked rugged.
        </p>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/create">
            <LarvaIcon /> Morph a token
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">
            <LayoutGrid /> Browse the brood
          </Link>
        </Button>
        <Button asChild variant="subtle">
          <Link href="/docs/api">
            <Code2 /> Developer API
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Credits: map terrain is <em>Melancholy</em> by Alexandre Coderre-Chabot (
        <a href="https://acodcha.github.io/sc/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          acodcha.github.io/sc
        </a>
        ), licensed{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          CC BY 4.0
        </a>
        , shown as the creep map background.
      </p>
    </div>
  )
}
