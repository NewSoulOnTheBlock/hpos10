'use client'

import { useMemo, useSyncExternalStore } from 'react'

/**
 * Larva slots: up to three launch drafts kept in this browser. A larva with a
 * draft shows filled on the map; an empty one is the green wireframe.
 * Storage can be unavailable (private mode), so every access is guarded.
 */
export const LARVA_SLOTS = 3
export type LarvaDraft = {
  name?: string
  symbol?: string
  description?: string
  website?: string
  twitter?: string
  telegram?: string
  firstBuy?: string
  image?: { dataUrl: string; name: string } | null
  updatedAt: number
}

const key = (slot: number) => `hatchery-larva-${slot}`
const EVENT = 'hatchery-larva'

export function readLarva(slot: number): LarvaDraft | null {
  try {
    const raw = localStorage.getItem(key(slot))
    return raw ? (JSON.parse(raw) as LarvaDraft) : null
  } catch {
    return null
  }
}

export function writeLarva(slot: number, draft: Omit<LarvaDraft, 'updatedAt'> | null): void {
  try {
    if (!draft) localStorage.removeItem(key(slot))
    else {
      const full = { ...draft, updatedAt: Date.now() }
      try {
        localStorage.setItem(key(slot), JSON.stringify(full))
      } catch {
        // Quota: keep the text, drop the image.
        localStorage.setItem(key(slot), JSON.stringify({ ...full, image: null }))
      }
    }
    window.dispatchEvent(new Event(EVENT))
  } catch {
    // Storage unavailable: drafts just don't persist.
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** The raw stored drafts, joined: a stable string snapshot for useSyncExternalStore. */
function snapshot(): string {
  try {
    return Array.from({ length: LARVA_SLOTS }, (_, i) => localStorage.getItem(key(i)) ?? '').join('\u0000')
  } catch {
    return ''
  }
}

/** All three slots, kept in sync across components (and tabs). Empty on the server. */
export function useLarvae(): (LarvaDraft | null)[] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '')
  return useMemo(
    () =>
      Array.from({ length: LARVA_SLOTS }, (_, i) => {
        const v = raw.split('\u0000')[i]
        try {
          return v ? (JSON.parse(v) as LarvaDraft) : null
        } catch {
          return null
        }
      }),
    [raw],
  )
}
