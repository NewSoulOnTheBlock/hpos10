'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The creep's world and its camera.
 *
 * World coordinates are pixels at zoom 1 with the platform Hive at (0, 0).
 * Tokens are laid out oldest-first on a sunflower spiral, so the order they
 * were created in (never changes) fixes each one's spot, and new tokens land
 * on the outer ring. A small offset from the mint keeps rings from looking
 * like a grid. The camera pans (drag, WASD/arrows, screen edges, minimap) and
 * zooms towards the cursor, clamped to the populated area.
 */

export type Vec = { x: number; y: number }
export type Cam = Vec & { z: number }

const GOLDEN = Math.PI * (3 - Math.sqrt(5))
const SPACING = 170 // distance between neighbouring structures
const HOLE = 4 // leave the first rings empty around the Hive
export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 1.8

function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Spot `i` on the spiral, nudged by the mint. y is squashed a little for the isometric feel. */
export function placeOf(i: number, mint: string): Vec {
  const r = SPACING * Math.sqrt(i + HOLE)
  const a = i * GOLDEN
  const h = hash(mint)
  const jx = ((h & 0xff) / 255 - 0.5) * 50
  const jy = (((h >>> 8) & 0xff) / 255 - 0.5) * 40
  return { x: Math.round(r * Math.cos(a) + jx), y: Math.round(r * Math.sin(a) * 0.78 + jy) }
}

/** Half-size of the world that holds `n` structures, with a margin to wander into. */
export function worldRadius(n: number): number {
  return Math.max(1300, SPACING * Math.sqrt(n + HOLE) + 520)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Opening zoom for a viewport: 1 on a 1920×1080 screen, further out as it
 * shrinks (1366×768 ≈ 0.76, 1280×720 ≈ 0.71); phones by width (390 ≈ 0.43).
 */
export function initialZoom(w: number, h: number): number {
  if (w < 768) return clamp(w / 900, ZOOM_MIN, 1)
  return clamp(Math.min(w / 1800, h / 1000), 0.55, 1)
}

export type EdgeDir = 'up' | 'down' | 'left' | 'right' | null

/**
 * Camera state and input for a viewport element. `radius` bounds panning.
 * Returns the camera, the viewport size, handlers to spread on the viewport,
 * the edge-scroll direction (for the cursor), and helpers.
 */
export function useCamera(radius: number) {
  const viewport = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState<Cam>({ x: 0, y: -60, z: 1 })
  const [size, setSize] = useState({ w: 1200, h: 700 })
  const [edge, setEdge] = useState<EdgeDir>(null)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  /** True right after a drag, so the click that ends it doesn't select a structure. */
  const dragged = useRef(false)
  const keys = useRef(new Set<string>())
  const pointer = useRef<{ x: number; y: number; inside: boolean }>({ x: 0, y: 0, inside: false })

  const bound = useCallback((c: Cam): Cam => ({ x: clamp(c.x, -radius, radius), y: clamp(c.y, -radius * 0.8, radius * 0.8), z: clamp(c.z, ZOOM_MIN, ZOOM_MAX) }), [radius])

  // Viewport size.
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    let first = true
    const ro = new ResizeObserver(([e]) => {
      if (!e) return
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
      // Smaller screens open further out, so the first view shows the swarm, not one creature.
      if (first) {
        first = false
        setCam((c) => ({ ...c, z: initialZoom(e.contentRect.width, e.contentRect.height) }))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keyboard (WASD / arrows) and screen-edge scrolling share one frame loop.
  useEffect(() => {
    const move = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      return !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName) || !!t.closest('[role="dialog"]'))
    }
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (!move.has(k) || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return
      keys.current.add(k)
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    const blur = () => keys.current.clear()
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, inside: true }
    }
    const onLeave = () => (pointer.current.inside = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)

    const fine = window.matchMedia('(pointer: fine)').matches
    let raf = 0
    let last = performance.now()
    let lastEdge: EdgeDir = null
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      let dx = 0
      let dy = 0
      const k = keys.current
      if (k.has('a') || k.has('arrowleft')) dx -= 1
      if (k.has('d') || k.has('arrowright')) dx += 1
      if (k.has('w') || k.has('arrowup')) dy -= 1
      if (k.has('s') || k.has('arrowdown')) dy += 1
      // Screen edges (mouse only, not while dragging).
      let e: EdgeDir = null
      const p = pointer.current
      if (fine && p.inside && !drag.current && document.hasFocus()) {
        const m = 6
        if (p.x <= m) {
          dx -= 1
          e = 'left'
        } else if (p.x >= window.innerWidth - m) {
          dx += 1
          e = 'right'
        }
        if (p.y <= m) {
          dy -= 1
          e = 'up'
        } else if (p.y >= window.innerHeight - m) {
          dy += 1
          e = 'down'
        }
      }
      if (e !== lastEdge) {
        lastEdge = e
        setEdge(e)
      }
      if (dx || dy) {
        setCam((c) => bound({ ...c, x: c.x + (dx * 900 * dt) / c.z, y: c.y + (dy * 900 * dt) / c.z }))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [bound])

  // Wheel zoom towards the cursor. Non-passive so the page doesn't scroll.
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left - r.width / 2
      const my = e.clientY - r.top - r.height / 2
      setCam((c) => {
        const z = clamp(c.z * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX)
        // Keep the world point under the cursor where it is.
        const wx = c.x + mx / c.z
        const wy = c.y + my / c.z
        return bound({ x: wx - mx / z, y: wy - my / z, z })
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [bound])

  // Drag to pan (mouse, pen or one finger), pinch to zoom (two fingers). A drag under 5px is a click.
  const touches = useRef(new Map<number, Vec>())
  const pinch = useRef<number | null>(null)
  const spread = () => {
    const [a, b] = [...touches.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.current.size === 2) {
      // Second finger: stop panning, start pinching; the gesture never counts as a click.
      pinch.current = spread()
      drag.current = null
      dragged.current = true
      return
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    dragged.current = false
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current !== null && touches.current.size >= 2) {
      const d = spread()
      const ratio = pinch.current > 0 ? d / pinch.current : 1
      pinch.current = d
      const r = viewport.current?.getBoundingClientRect()
      const [a, b] = [...touches.current.values()]
      if (!r || !a || !b) return
      const mx = (a.x + b.x) / 2 - r.left - r.width / 2
      const my = (a.y + b.y) / 2 - r.top - r.height / 2
      setCam((c) => {
        const z = clamp(c.z * ratio, ZOOM_MIN, ZOOM_MAX)
        // Keep the world point between the fingers where it is.
        return bound({ x: c.x + mx / c.z - mx / z, y: c.y + my / c.z - my / z, z })
      })
      return
    }
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    if (!d.moved) {
      d.moved = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    d.x = e.clientX
    d.y = e.clientY
    setCam((c) => bound({ ...c, x: c.x - dx / c.z, y: c.y - dy / c.z }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId)
    if (touches.current.size < 2) pinch.current = null
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    dragged.current = d.moved
    drag.current = null
  }

  const centerOn = useCallback((p: Vec) => setCam((c) => bound({ ...c, x: p.x, y: p.y })), [bound])

  return {
    viewport,
    cam,
    size,
    edge,
    wasDrag: () => dragged.current,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    centerOn,
    setZoom: (z: number) => setCam((c) => bound({ ...c, z })),
  }
}
