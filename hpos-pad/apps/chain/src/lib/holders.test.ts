import { Keypair } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'
import { allocate } from './holders.js'

const w = () => Keypair.generate().publicKey.toBase58()

describe('allocate', () => {
  it('conserves the pot exactly', () => {
    const holders = Array.from({ length: 37 }, (_, i) => ({ owner: w(), amount: BigInt(1000 + i * 7919) }))
    const pot = 1_000_003n
    const { payouts, carry } = allocate(holders, pot, { minPayout: 1n, minHoldingBps: 0, excluded: new Set() })
    expect(payouts.reduce((a, p) => a + p.amount, 0n) + carry).toBe(pot)
  })

  it('pays nothing to excluded or sub-threshold holders and carries their share', () => {
    const a = w()
    const b = w()
    const { payouts, carry } = allocate(
      [
        { owner: a, amount: 900n },
        { owner: b, amount: 100n },
      ],
      1000n,
      { minPayout: 200n, minHoldingBps: 0, excluded: new Set() },
    )
    expect(payouts).toEqual([{ owner: a, amount: 900n }])
    expect(carry).toBe(100n)
  })
})
