/**
 * A token's life state on the creep: ALIVE, DEAD (went quiet) or RUGGED
 * (the creator dumped a token that had real traction, and it collapsed).
 *
 * RUGGED needs all four:
 *   1. it migrated off the bonding curve (a curve coin is never burned);
 *   2. the creator sold more than `creatorSoldBps` of the tokens they bought;
 *   3. it had traction: at least `minHolders` holders and, on some day, more
 *      than `minPeakVolumeUsd` of 24h volume (so a coin nobody touched is
 *      never called a rug);
 *   4. it collapsed: no trade for `rugIdleHours`, or market cap more than
 *      `athDrawdownBps` below its all-time high.
 * RUGGED is final. DEAD is `deadIdleHours` without a trade and revives on the
 * next trade.
 */
export type LifeState = 'ALIVE' | 'DEAD' | 'RUGGED'

export type LifeRules = {
  creatorSoldBps: number
  minHolders: number
  minPeakVolumeUsd: number
  rugIdleHours: number
  athDrawdownBps: number
  deadIdleHours: number
}

export const DEFAULT_LIFE_RULES: LifeRules = {
  creatorSoldBps: 5_000,
  minHolders: 15,
  minPeakVolumeUsd: 8_000,
  rugIdleHours: 6,
  athDrawdownBps: 7_000,
  deadIdleHours: 24,
}

export type Vitals = {
  previous: LifeState
  /** Graduated to DAMM v2. */
  migrated: boolean
  /** Share of the creator's bought tokens they have sold, in bps (0 if they never bought). */
  creatorSoldBps: number
  peakHolders: number
  /** Highest 24h volume ever seen, in USD; null when the quote price is unknown. */
  peakVolumeUsd: number | null
  /** Hours since the last trade (or since launch if it never traded). */
  idleHours: number
  marketCapQuote: number
  athMarketCapQuote: number
}

export function lifeStateOf(v: Vitals, r: LifeRules = DEFAULT_LIFE_RULES): LifeState {
  if (v.previous === 'RUGGED') return 'RUGGED'
  const dumped = v.creatorSoldBps > r.creatorSoldBps
  const traction = v.peakHolders >= r.minHolders && v.peakVolumeUsd !== null && v.peakVolumeUsd > r.minPeakVolumeUsd
  const drawdownBps = v.athMarketCapQuote > 0 ? (1 - v.marketCapQuote / v.athMarketCapQuote) * 10_000 : 0
  const collapsed = v.idleHours >= r.rugIdleHours || drawdownBps > r.athDrawdownBps
  if (v.migrated && dumped && traction && collapsed) return 'RUGGED'
  if (v.idleHours >= r.deadIdleHours) return 'DEAD'
  return 'ALIVE'
}

/** Sold / bought in bps, integer math on raw base amounts. */
export function soldBps(bought: bigint, sold: bigint): number {
  if (bought <= 0n) return 0
  return Number((sold * 10_000n) / bought)
}
