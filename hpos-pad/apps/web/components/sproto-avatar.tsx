import { cn } from '@/lib/utils'

/**
 * A Sproto Gremlin avatar for any wallet: the address picks one of the 80
 * gremlins (cut from the HPOS10I collection mosaic, public/sproto-avatars.webp),
 * a background colour from the HPOS10I logo palette, a pattern, and whether
 * the character faces left or right. Deterministic, so a wallet always gets
 * the same one. It's a profile picture, not a claim of NFT ownership.
 */

const COUNT = 80
const COLS = 10
const ROWS = 8

// HPOS10I logo palette: [background, pattern ink].
const PALETTE: [string, string][] = [
  ['#007cf0', '#3d9bff'], // Sonic blue
  ['#f40000', '#ff4a3d'], // shoe red
  ['#feeb00', '#fff58a'], // glove yellow
  ['#fe8e00', '#ffb24d'], // bitcoin orange
  ['#92cf00', '#b8ec3a'], // lime
  ['#698f8b', '#86aba7'], // steel teal
  ['#f9faf9', '#dfe3df'], // white
  ['#2b2e28', '#3d484b'], // ink
]

const PATTERNS = ['plain', 'burst', 'stripes', 'dots', 'checker'] as const

/** FNV-1a: a small, stable hash of the address. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function sprotoFor(address: string) {
  const h = hash(address)
  const h2 = hash(`${address}:bg`)
  return {
    index: h % COUNT,
    palette: PALETTE[h2 % PALETTE.length]!,
    pattern: PATTERNS[(h2 >>> 8) % PATTERNS.length]!,
    flip: ((h >>> 16) & 1) === 1,
  }
}

function patternLayer(pattern: (typeof PATTERNS)[number], ink: string): string | undefined {
  switch (pattern) {
    case 'burst':
      return `repeating-conic-gradient(from 0deg at 50% 60%, ${ink} 0 10deg, transparent 10deg 20deg)`
    case 'stripes':
      return `repeating-linear-gradient(135deg, ${ink} 0 6%, transparent 6% 14%)`
    case 'dots':
      return `radial-gradient(${ink} 18%, transparent 20%) 0 0 / 25% 25%`
    case 'checker':
      return `repeating-conic-gradient(${ink} 0 25%, transparent 0 50%) 0 0 / 34% 34%`
    default:
      return undefined
  }
}

export function SprotoAvatar({ address, className, title }: { address: string; className?: string; title?: string }) {
  const { index, palette, pattern, flip } = sprotoFor(address)
  const [bg, ink] = palette
  const col = index % COLS
  const row = Math.floor(index / COLS)
  const layer = patternLayer(pattern, ink)
  return (
    <span
      role="img"
      aria-label={title ?? 'Sproto avatar'}
      title={title}
      className={cn(
        'relative inline-block size-8 shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_#0b0e0f,0_0_0_2px_#3d484b]',
        className,
      )}
      style={{ background: layer ? `${layer}, ${bg}` : bg }}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-no-repeat"
        style={{
          backgroundImage: "url('/sproto-avatars.webp')",
          backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${(col / (COLS - 1)) * 100}% ${(row / (ROWS - 1)) * 100}%`,
          transform: flip ? 'scaleX(-1)' : undefined,
        }}
      />
    </span>
  )
}
