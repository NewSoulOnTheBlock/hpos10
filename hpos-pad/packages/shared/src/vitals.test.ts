import { describe, expect, it } from 'vitest'
import { lifeStateOf, soldBps, type Vitals } from './vitals.js'

const base: Vitals = {
  previous: 'ALIVE',
  migrated: true,
  creatorSoldBps: 8_000,
  peakHolders: 40,
  peakVolumeUsd: 20_000,
  idleHours: 7,
  marketCapQuote: 100,
  athMarketCapQuote: 1_000,
}

describe('lifeStateOf', () => {
  it('rugs when the creator dumped a token with traction and it collapsed', () => {
    expect(lifeStateOf(base)).toBe('RUGGED')
    expect(lifeStateOf({ ...base, peakHolders: 15 })).toBe('RUGGED') // 15 is enough
    expect(lifeStateOf({ ...base, idleHours: 1 })).toBe('RUGGED') // -90% from ATH is a collapse too
  })
  it('is not a rug without a dump, traction or a collapse', () => {
    expect(lifeStateOf({ ...base, creatorSoldBps: 5_000 })).toBe('ALIVE')
    expect(lifeStateOf({ ...base, migrated: false })).toBe('ALIVE') // still on the curve
    expect(lifeStateOf({ ...base, peakHolders: 14 })).toBe('ALIVE')
    expect(lifeStateOf({ ...base, peakHolders: 1 })).toBe('ALIVE')
    expect(lifeStateOf({ ...base, peakVolumeUsd: 8_000 })).toBe('ALIVE')
    expect(lifeStateOf({ ...base, peakVolumeUsd: null })).toBe('ALIVE')
    expect(lifeStateOf({ ...base, idleHours: 1, marketCapQuote: 400 })).toBe('ALIVE')
  })
  it('goes DEAD after a day of silence, revives on trading, and a rug is final', () => {
    expect(lifeStateOf({ ...base, creatorSoldBps: 0, idleHours: 30 })).toBe('DEAD')
    expect(lifeStateOf({ ...base, creatorSoldBps: 0, idleHours: 0, previous: 'DEAD' })).toBe('ALIVE')
    expect(lifeStateOf({ ...base, creatorSoldBps: 0, idleHours: 0, previous: 'RUGGED' })).toBe('RUGGED')
  })
  it('computes the sold share', () => {
    expect(soldBps(0n, 5n)).toBe(0)
    expect(soldBps(1_000n, 501n)).toBe(5_010)
  })
})
