import { cn } from '@/lib/utils'

/**
 * Resource and brood glyphs in the style of a classic sci-fi RTS HUD. Inline
 * SVG so they stay crisp at any size and need no image assets.
 */
type IconProps = { className?: string; title?: string }

function Svg({ className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('inline-block size-5 shrink-0', className)} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

/** A cluster of blue mineral crystals. */
export function MineralIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 28 9 13l5-5 3 20Z" fill="#2f7fd8" stroke="#0b2a52" strokeWidth=".9" />
      <path d="M9 13l5-5 1 9Z" fill="#8fd0ff" />
      <path d="M13 28 16 6l6 6-2 16Z" fill="#3fa0ff" stroke="#0b2a52" strokeWidth=".9" />
      <path d="M16 6l6 6-5 2Z" fill="#c7ecff" />
      <path d="M19 28l3-12 5 3-1 9Z" fill="#2a6fc4" stroke="#0b2a52" strokeWidth=".9" />
      <path d="M22 16l5 3-4 1Z" fill="#9edaff" />
    </Svg>
  )
}

/** A vespene gas canister with a green glow. */
export function GasIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="8" y="7" width="16" height="21" rx="3" fill="#2a3a2c" stroke="#0d1a10" strokeWidth="1" />
      <rect x="11" y="10" width="10" height="15" rx="1.5" fill="#46e36a" />
      <rect x="12.2" y="11" width="2.4" height="13" rx="1" fill="#c9ffd2" opacity=".75" />
      <rect x="11" y="3.5" width="10" height="4" rx="1" fill="#6b7d74" stroke="#0d1a10" strokeWidth=".9" />
      <path d="M8 14h3M8 20h3M21 14h3M21 20h3" stroke="#0d1a10" strokeWidth="1" />
    </Svg>
  )
}

/** Supply: a floating overseer, the brood's control unit. */
export function SupplyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="16" cy="13" rx="11" ry="8" fill="#7a4a2a" stroke="#2a130a" strokeWidth="1" />
      <path d="M7 11c3-3 15-3 18 0" stroke="#c98a55" strokeWidth="1.4" fill="none" />
      <ellipse cx="16" cy="14" rx="3" ry="2.4" fill="#fe8e00" />
      <path d="M9 19c-1 4-1 7 1 9M14 21c0 3 0 5 1 7M18 21c0 3 0 5-1 7M23 19c1 4 1 7-1 9" stroke="#007cf0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </Svg>
  )
}

/** The Hatchery: an organic mound with a glowing maw. The site's mark. */
export function HatcheryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 28c1-9 6-17 13-19 7 2 12 10 13 19Z" fill="#1b2f8a" stroke="#007cf0" strokeWidth="1.4" />
      <path d="M8 28c1-6 4-11 8-12 4 1 7 6 8 12" fill="none" stroke="#9fd0ff" strokeWidth="1.1" opacity=".8" />
      <ellipse cx="16" cy="20" rx="3.6" ry="4.2" fill="#92cf00" />
      <ellipse cx="16" cy="20" rx="1.5" ry="2.4" fill="#f4ffd6" />
      <path d="M6 10l4 3M26 10l-4 3M16 4v5" stroke="#007cf0" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  )
}

/** A larva: segmented grub. */
export function LarvaIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 22c0-5 5-8 11-8s11 3 11 7c0 3-3 5-7 5H10c-3 0-5-2-5-4Z" fill="#2545d1" stroke="#0b1336" strokeWidth="1" />
      <path d="M11 15v10M16 14v12M21 15v10" stroke="#0b1336" strokeWidth="1" />
      <circle cx="24" cy="19" r="1.4" fill="#92cf00" />
      <path d="M26 17l3-3" stroke="#007cf0" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  )
}

/** A cocoon: veined egg. */
export function CocoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M16 3c6 0 10 8 10 15s-4 11-10 11S6 25 6 18 10 3 16 3Z" fill="#8a5a26" stroke="#2e1a07" strokeWidth="1" />
      <path d="M16 4c-3 6-3 18 0 24M11 8c2 5 2 14 0 19M21 8c-2 5-2 14 0 19" stroke="#fe8e00" strokeWidth=".9" fill="none" opacity=".7" />
      <ellipse cx="16" cy="17" rx="3" ry="5" fill="#fe8e00" opacity=".35" />
    </Svg>
  )
}

/** The Hive: a towering spired structure. Graduated tokens. */
export function HiveIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 29c2-8 6-12 9-13l1-9 3-4 3 4 1 9c3 1 7 5 9 13Z" fill="#1a2a66" stroke="#92cf00" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M13 16c1-2 5-2 6 0" stroke="#007cf0" strokeWidth="1.2" fill="none" />
      <ellipse cx="16" cy="22" rx="3" ry="3.4" fill="#92cf00" />
      <path d="M16 3v4" stroke="#d4f56a" strokeWidth="1.4" />
    </Svg>
  )
}

/** Crosshair reticle: trading activity. */
export function ReticleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 3v7M16 22v7M3 16h7M22 16h7" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="1.6" fill="currentColor" />
    </Svg>
  )
}
