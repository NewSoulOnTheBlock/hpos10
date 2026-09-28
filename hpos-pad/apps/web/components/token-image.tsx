'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Unit portrait: a plain <img> (IPFS gateways vary) in a monitor bezel with
 * scanlines, and a glyph fallback so broken art never shifts layout.
 */
export function TokenImage({
  src,
  symbol,
  className,
}: {
  src: string | null | undefined
  symbol: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const showImg = src && !failed
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-[4px] border border-black bg-black shadow-[0_0_0_2px_#3e3a35,0_0_0_3px_#000,inset_0_0_14px_rgb(0_0_0/0.8)]',
        className,
      )}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="grid size-full place-items-center bg-[radial-gradient(circle,rgb(240_168_24/0.2),transparent_70%)] font-display text-sm font-extrabold kit-amber">
          {symbol.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(180deg,rgb(255_255_255/0.04)_0_1px,transparent_1px_3px)]" aria-hidden />
    </div>
  )
}
