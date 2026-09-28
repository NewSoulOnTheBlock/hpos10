'use client'

import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'rgb(0 0 0 / 0.94)',
          border: '2px solid #f0a818', borderRadius: '6px',
          color: 'var(--foreground)',
          fontFamily: 'var(--font-body)',
          fontSize: '15px',
        },
      }}
    />
  )
}
