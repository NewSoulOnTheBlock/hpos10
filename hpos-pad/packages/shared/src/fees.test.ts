import { describe, expect, it } from 'vitest'
import { feeSplit, splitClaim } from './fees.js'
import { priceFromSqrtPrice, toRaw, toUi } from './amounts.js'

describe('feeSplit', () => {
  it('4.5% = 2.3% holders + 0.7% creator + 0.6% platform + 0.9% Meteora', () => {
    expect(feeSplit({ tradeFeeBps: 450, reflectionBps: 230, creatorBps: 70 })).toEqual({
      tradeFeeBps: 450,
      protocolBps: 90,
      reflectionBps: 230,
      creatorBps: 70,
      platformBps: 60,
      claimableBps: 360,
    })
  })

  it('without a creator share the platform keeps the remainder', () => {
    expect(feeSplit({ tradeFeeBps: 500, reflectionBps: 300 })).toMatchObject({ protocolBps: 100, platformBps: 100, creatorBps: 0 })
  })

  it('rejects shares larger than the claimable fee', () => {
    expect(() => feeSplit({ tradeFeeBps: 450, reflectionBps: 230, creatorBps: 70 + 70 })).toThrow()
    expect(() => feeSplit({ tradeFeeBps: 450, reflectionBps: 400 })).toThrow()
  })
})

describe('splitClaim', () => {
  const split = feeSplit({ tradeFeeBps: 450, reflectionBps: 230, creatorBps: 70 })

  it('never invents or loses a unit', () => {
    for (const claimed of [0n, 1n, 7n, 359n, 999_999n, 519_036_058n]) {
      const { holders, creator, platform } = splitClaim(claimed, split)
      expect(holders + creator + platform).toBe(claimed)
    }
  })

  it('pays each party its exact proportion, remainder to holders', () => {
    const { holders, creator, platform } = splitClaim(3_600_000n, split)
    expect(creator).toBe(700_000n)
    expect(platform).toBe(600_000n)
    expect(holders).toBe(2_300_000n)
  })
})

describe('splitClaim without reflections (the Hatchery default)', () => {
  const split = feeSplit({ tradeFeeBps: 160, reflectionBps: 0, creatorBps: 75 })

  it('1.6% = 0.75% creator + 0.53% platform + 0.32% Meteora', () => {
    expect(split).toMatchObject({ protocolBps: 32, claimableBps: 128, creatorBps: 75, platformBps: 53, reflectionBps: 0 })
  })

  it('pays holders nothing and gives the rounding remainder to the platform', () => {
    for (const claimed of [0n, 1n, 7n, 127n, 999_999n, 519_036_058n]) {
      const { holders, creator, platform } = splitClaim(claimed, split)
      expect(holders).toBe(0n)
      expect(holders + creator + platform).toBe(claimed)
    }
    expect(splitClaim(1_280_000n, split)).toEqual({ holders: 0n, creator: 750_000n, platform: 530_000n })
  })
})

describe('amounts', () => {
  it('round-trips', () => {
    expect(toUi(toRaw('1234.5', 6), 6)).toBe('1234.5')
    expect(toUi(1n, 6)).toBe('0.000001')
    expect(toRaw('0.1234567', 6)).toBe(123456n)
  })

  it('prices a Q64 sqrt price', () => {
    // sqrt(1) in Q64 with equal decimals is a price of exactly 1.
    expect(priceFromSqrtPrice(1n << 64n, 6, 6)).toBe(1)
  })
})
