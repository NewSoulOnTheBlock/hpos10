'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChainEvent } from '@hpos-pad/shared'
import { realtime } from '@/lib/ws'

/** Subscribe to one topic ("trades", "tokens", "token:<mint>") for the component's lifetime. */
export function useTopic(topic: string | null, handler: (event: ChainEvent) => void) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (!topic) return
    return realtime.subscribe(topic, (e) => ref.current(e))
  }, [topic])
}

export function useRealtimeStatus(): boolean {
  const [connected, setConnected] = useState(false)
  useEffect(() => realtime.onStatus(setConnected), [])
  return connected
}
