'use client'

import { useState } from 'react'
import { isHatched, type Mob } from '@/lib/evolution'
import { cn } from '@/lib/utils'

/**
 * Sprites for the creep map: pixel-art strips in public/zerg (player colour
 * recoloured to HPOS yellow) played with CSS steps(). The platform's
 * buildings and the drone come from scripts/zerg-sprites.py / zerg-units.py;
 * the mobs (larva, curl, egg, prebirth, hatch-*) from scripts/zerg-mobs.py.
 * A few SVG pieces (minerals, the Cerebrate portrait) remain hand-drawn.
 */

/** Frame sizes of each strip in public/zerg, in source pixels. */
const STRIPS = {
  hatchery: { w: 119, h: 88, frames: 4, fps: 5 },
  lair: { w: 128, h: 105, frames: 4, fps: 5 },
  hive: { w: 121, h: 129, frames: 4, fps: 5 },
  drone: { w: 33, h: 33, frames: 7, fps: 9 },
  splat: { w: 69, h: 50, frames: 12, fps: 10 },
  larva: { w: 30, h: 13, frames: 5, fps: 6 },
  curl: { w: 33, h: 25, frames: 4, fps: 6 },
  egg: { w: 32, h: 30, frames: 12, fps: 8 },
  prebirth: { w: 32, h: 37, frames: 8, fps: 8 },
  'hatch-zergling': { w: 56, h: 39, frames: 7, fps: 7 },
  'hatch-hydralisk': { w: 56, h: 41, frames: 7, fps: 7 },
  'hatch-mutalisk': { w: 59, h: 84, frames: 7, fps: 7 },
  'hatch-queen': { w: 55, h: 80, frames: 7, fps: 7 },
  'hatch-defiler': { w: 59, h: 46, frames: 7, fps: 7 },
  'hatch-ultralisk': { w: 69, h: 58, frames: 7, fps: 7 },
  'idle-zergling': { w: 54, h: 33, frames: 1, fps: 1 },
  'idle-hydralisk': { w: 55, h: 37, frames: 1, fps: 1 },
  'idle-mutalisk': { w: 46, h: 47, frames: 1, fps: 1 },
  'idle-queen': { w: 47, h: 48, frames: 1, fps: 1 },
  'idle-defiler': { w: 59, h: 37, frames: 1, fps: 1 },
  'idle-ultralisk': { w: 68, h: 57, frames: 1, fps: 1 },
} as const
export type StripName = keyof typeof STRIPS

/**
 * Plays a horizontal sprite strip, crisp (pixelated) at any size. `still` shows
 * frame 0 only, `hold` the last frame; `once` plays it through a single time,
 * holds the last frame and then calls `onEnd`.
 */
export function AnimatedSprite({
  name,
  className,
  still = false,
  hold = false,
  once = false,
  onEnd,
}: {
  name: StripName
  className?: string
  still?: boolean
  hold?: boolean
  once?: boolean
  onEnd?: () => void
}) {
  const { w, h, frames, fps } = STRIPS[name]
  const last = `${(-100 * (frames - 1)) / frames}%`
  return (
    <span className={cn('relative block overflow-hidden', className)} style={{ aspectRatio: `${w} / ${h}` }} aria-hidden>
      <span
        className="zsprite absolute inset-y-0 left-0"
        onAnimationEnd={onEnd}
        style={{
          width: `${frames * 100}%`,
          backgroundImage: `url('/zerg/${name}.webp')`,
          animationDuration: `${frames / fps}s`,
          animationTimingFunction: once ? `steps(${frames - 1}, jump-none)` : `steps(${frames})`,
          // Inline, so it beats the unlayered .zsprite animation.
          ...((still || hold) && { animation: 'none', transform: hold ? `translateX(${last})` : undefined }),
          ...(once && {
            animationName: 'zsprite-once',
            animationIterationCount: 1,
            animationFillMode: 'forwards',
            ['--last' as string]: last,
          }),
        }}
      />
    </span>
  )
}

/** Plays `first` once, then loops `then` (e.g. the larva curling into an egg, then the egg pulsing). */
export function SpriteSequence({ first, then, className }: { first: StripName; then: StripName; className?: string }) {
  const [done, setDone] = useState(false)
  return done ? <AnimatedSprite name={then} className={className} /> : <AnimatedSprite name={first} once onEnd={() => setDone(true)} className={className} />
}

type P = { className?: string }

const CREEP_DARK = 'var(--creep-deep)'

function Box({ className, children, label }: P & { children: React.ReactNode; label?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={cn('block', className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {children}
    </svg>
  )
}

/** A live curve: the hatchery. */
export function HatcherySprite({ className }: P) {
  return <AnimatedSprite name="hatchery" className={className} />
}

/** Mobs that fly: they hover above their shadow instead of standing on the creep. */
export const FLYERS: ReadonlySet<Mob> = new Set(['mutalisk', 'queen'])

/**
 * A token as a mob. Larvae wriggle and eggs pulse; a hatched creature breathes
 * (flyers hover). `grow` plays the transformation once: the curl into an egg,
 * or the birth out of the egg.
 */
export function MobSprite({ mob, className, still, grow }: P & { mob: Mob; still?: boolean; grow?: boolean }) {
  const [grown, setGrown] = useState(false)
  const growing = grow && !still && !grown
  if (isHatched(mob)) {
    return growing ? (
      <AnimatedSprite name={`hatch-${mob}`} once onEnd={() => setGrown(true)} className={className} />
    ) : (
      <span className={cn('block', !still && (FLYERS.has(mob) ? 'mob-fly' : 'mob-idle'), className)}>
        <AnimatedSprite name={`idle-${mob}`} still className="w-full" />
      </span>
    )
  }
  if (mob === 'egg' && growing) return <AnimatedSprite name="curl" once onEnd={() => setGrown(true)} className={className} />
  return <AnimatedSprite name={mob === 'hatching' ? 'prebirth' : mob} className={className} still={still} />
}

/** A larva: a draft slot waiting to be morphed. `wire` (empty slot) shows it as a green wireframe. */
export function LarvaSprite({ className, wire = false }: P & { wire?: boolean }) {
  return <AnimatedSprite name="larva" className={cn(wire && 'wireframe opacity-80', className)} still={wire} />
}

/** A drone: one of your bags, tending a structure. */
export function DroneSprite({ className }: P) {
  return <AnimatedSprite name="drone" className={className} />
}

/** Blue mineral crystals, map decoration. */
export function MineralsSprite({ className }: P) {
  return (
    <Box className={className}>
      <ellipse cx="64" cy="116" rx="44" ry="7" fill="rgb(0 0 0 / 0.4)" />
      <path d="M24 116 32 60l14-16 8 72Z" fill="#005fb8" stroke="#00264a" strokeWidth="2" />
      <path d="M50 116 60 26l20 22-6 68Z" fill="#007cf0" stroke="#00264a" strokeWidth="2" />
      <path d="M78 116l8-44 18 12-4 32Z" fill="#0068cc" stroke="#00264a" strokeWidth="2" />
      <path d="M60 26l20 22-14 6Z M32 60l14-16 2 30Z M86 72l18 12-12 2Z" fill="#9fd0ff" opacity=".85" />
    </Box>
  )
}

/** The Cerebrate: the adjutant who briefs you. */
export function CerebratePortrait({ className }: P) {
  return (
    <Box className={className} label="The Cerebrate">
      <rect width="128" height="128" fill="#070c0c" />
      <path d="M10 128c4-40 24-70 54-74 30 4 50 34 54 74Z" fill={CREEP_DARK} />
      <path d="M22 70c-6-22 6-50 42-54 36 4 48 32 42 54-6 18-22 30-42 30S28 88 22 70Z" fill="#6a2f5a" stroke="#0b0e0f" strokeWidth="2" />
      <path d="M30 60c8-20 22-30 34-30s26 10 34 30M36 76c10 8 18 10 28 10s18-2 28-10" stroke="#a24d8a" strokeWidth="3" fill="none" />
      <path d="M40 52c4-6 10-8 16-6M88 52c-4-6-10-8-16-6" stroke="#0b0e0f" strokeWidth="3" fill="none" />
      <ellipse cx="46" cy="60" rx="7" ry="5" fill="#92cf00" className="cerebrate-eye" />
      <ellipse cx="82" cy="60" rx="7" ry="5" fill="#92cf00" className="cerebrate-eye" />
      <path d="M46 88c8 6 28 6 36 0" stroke="#e7d3b0" strokeWidth="3" strokeDasharray="3 3" fill="none" />
      <path d="M22 70C8 78 4 96 8 110M106 70c14 8 18 26 14 40" stroke="#a24d8a" strokeWidth="4" fill="none" strokeLinecap="round" />
    </Box>
  )
}
