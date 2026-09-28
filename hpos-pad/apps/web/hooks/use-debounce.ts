'use client'

import { useEffect, useState } from 'react'

export function useDebounce<T>(value: T, delayMs = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return v
}
