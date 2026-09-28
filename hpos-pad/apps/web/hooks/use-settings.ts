'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PayWith } from '@hpos-pad/shared'
import { DEFAULT_SLIPPAGE_BPS } from '@/lib/constants'

type Settings = {
  slippageBps: number
  payWith: PayWith
  setSlippageBps: (bps: number) => void
  setPayWith: (p: PayWith) => void
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      slippageBps: DEFAULT_SLIPPAGE_BPS,
      payWith: 'SOL',
      setSlippageBps: (slippageBps) => set({ slippageBps: Math.max(10, Math.min(5000, Math.round(slippageBps))) }),
      setPayWith: (payWith) => set({ payWith }),
    }),
    { name: 'hpospad-settings' },
  ),
)
