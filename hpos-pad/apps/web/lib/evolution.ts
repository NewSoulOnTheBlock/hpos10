import type { TokenStatus } from '@hpos-pad/shared'

/**
 * A token's bonding-curve progress told as a brood's evolution, larva to
 * hive. Purely a label over real state: the stage is derived from `progress`
 * and `status`, never the other way round, so it can't overstate how close a
 * curve is to graduating.
 */
export type Stage = {
  id: 'larva' | 'cocoon' | 'mutating' | 'hatching' | 'hive'
  name: string
  tier: string
  hint: string
  /** Tailwind classes for the stage chip. */
  tone: string
}

const STAGES: Record<Stage['id'], Stage> = {
  larva: { id: 'larva', name: 'Larva', tier: 'I', hint: 'Bonding curve under 10% filled', tone: 'border-sonic/60 bg-sonic/10 text-glow-sonic' },
  cocoon: { id: 'cocoon', name: 'Cocoon', tier: 'II', hint: 'Bonding curve 10–66% filled', tone: 'border-amber/60 bg-amber/10 text-amber' },
  mutating: { id: 'mutating', name: 'Mutating', tier: 'III', hint: 'Bonding curve over 66% filled', tone: 'border-cyan/60 bg-cyan/10 text-glow-cyan' },
  hatching: { id: 'hatching', name: 'Hatching', tier: 'IV', hint: 'Curve complete: graduating to a DAMM v2 pool', tone: 'border-amber/70 bg-amber/15 text-amber' },
  hive: { id: 'hive', name: 'Hatched', tier: 'V', hint: 'Graduated: hatched, trading on a Meteora DAMM v2 pool', tone: 'border-phosphor/70 bg-phosphor/12 text-glow' },
}

export function stageOf(status: TokenStatus, progress: number): Stage {
  if (status === 'MIGRATED') return STAGES.hive
  if (status === 'COMPLETE') return STAGES.hatching
  if (progress >= 2 / 3) return STAGES.mutating
  if (progress >= LARVA_MAX_PROGRESS) return STAGES.cocoon
  return STAGES.larva
}

/** A curve under this share filled is still a larva; past it the larva curls into an egg. */
export const LARVA_MAX_PROGRESS = 0.1

/**
 * What a token looks like on the creep map: a mob. Same rule, a label over
 * real state. A fresh curve is a larva, it curls into an egg past 10%, a
 * full curve is about to hatch, and graduation hatches it into a creature
 * that grows bigger with market cap (MOB_TIERS). The platform token stays
 * the Hive in the middle.
 */
export type Mob = 'larva' | 'egg' | 'hatching' | Hatched
export type Hatched = 'zergling' | 'hydralisk' | 'mutalisk' | 'queen' | 'defiler' | 'ultralisk'

/**
 * Graduated tokens hatch into the biggest creature whose floors they meet:
 * market cap (USD) and holders. The holder floor stops a thin coin (a few
 * wallets pumping a big number) from growing into a giant.
 */
export const MOB_TIERS: { mob: Hatched; minUsd: number; minHolders: number }[] = [
  { mob: 'ultralisk', minUsd: 5_000_000, minHolders: 500 },
  { mob: 'defiler', minUsd: 1_000_000, minHolders: 250 },
  { mob: 'queen', minUsd: 500_000, minHolders: 100 },
  { mob: 'mutalisk', minUsd: 250_000, minHolders: 50 },
  { mob: 'hydralisk', minUsd: 100_000, minHolders: 25 },
  { mob: 'zergling', minUsd: 0, minHolders: 0 },
]

export function mobOf(t: { status: TokenStatus; progress: number; marketCapUsd: number | null; holders: number }): Mob {
  if (t.status === 'MIGRATED') {
    const usd = t.marketCapUsd ?? 0
    return MOB_TIERS.find((x) => usd >= x.minUsd && t.holders >= x.minHolders)!.mob
  }
  if (t.status === 'COMPLETE') return 'hatching'
  return t.progress < LARVA_MAX_PROGRESS ? 'larva' : 'egg'
}

export const isHatched = (m: Mob): m is Hatched => m !== 'larva' && m !== 'egg' && m !== 'hatching'

export const MOB_LABEL: Record<Mob, string> = {
  larva: 'Larva',
  egg: 'Egg',
  hatching: 'Hatching',
  zergling: 'Zergling',
  hydralisk: 'Hydralisk',
  mutalisk: 'Mutalisk',
  queen: 'Queen',
  defiler: 'Defiler',
  ultralisk: 'Ultralisk',
}

/** Rank of a mob, so the map can tell growth (play the hatch) from anything else. */
export const MOB_RANK: Record<Mob, number> = { larva: 0, egg: 1, hatching: 2, zergling: 3, hydralisk: 4, mutalisk: 5, queen: 6, defiler: 7, ultralisk: 8 }
