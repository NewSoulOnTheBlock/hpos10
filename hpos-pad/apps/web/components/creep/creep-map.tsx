'use client'

import { quoteDisplaySymbol, QUOTE_TICKER } from '@/lib/quote-display'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { toast } from 'sonner'
import type { TokenDTO } from '@hpos-pad/shared'
import { useStats, useToken, useTokenList } from '@/hooks/use-tokens'
import { useLaunchpadConfig, useQuoteSymbol } from '@/hooks/use-config'
import { useTokenBalance } from '@/hooks/use-token-balance'
import { MOB_LABEL, MOB_RANK, isHatched, mobOf, type Mob } from '@/lib/evolution'
import { LARVA_SLOTS, useLarvae } from '@/lib/larva'
import { formatCompact, formatUsd, shortAddress } from '@/lib/format'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'
import { HPOSPAD_TG_URL } from '@/lib/constants'
import { CopyButton } from '@/components/copy-button'
import { DistributedStat } from '@/components/distributed-stat'
import { placeOf, useCamera, worldRadius, type Cam, type Vec } from '@/components/creep/camera'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { TradePanel } from '@/components/token/trade-panel'
import { TokenImage } from '@/components/token-image'
import { QuoteIcon } from '@/components/quote-icon'
import { GameMenu } from '@/components/game-menu'
import { LarvaIcon, SupplyIcon } from '@/components/sc/icons'
import { AnimatedSprite, CerebratePortrait, DroneSprite, FLYERS, LarvaSprite, MobSprite } from '@/components/creep/sprites'

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <div className="h-8 w-28" /> },
)

/**
 * Screen 1, the creep, laid out like a classic RTS: the map fills the screen,
 * resources float top-right, and one HUD runs along the bottom (minimap,
 * selection panel with control groups, portrait, command card). Every token
 * is a mob from its real state (larva → egg → hatching → a creature that
 * grows with market cap, see lib/evolution.ts); its segmented bar is its
 * bonding-curve progress. The Hive in the middle is the platform token and
 * holds your three larva slots.
 */

/** Token list pages to load onto the map (100 each). */
const MAX_PAGES = 20
/** Map texture tile size in world pixels. */
const TILE = 2048
/** Hotspots of the edge-scroll cursors (public/cursors, scripts/cursors.py). */
const EDGE_HOT = { up: '18 0', down: '18 20', left: '0 16', right: '20 16' } as const

/** Width of each mob in world pixels (about 2x the source sprite, bigger tiers a little more). */
const SIZE: Record<Mob, number> = { larva: 84, egg: 78, hatching: 84, zergling: 100, hydralisk: 112, mutalisk: 108, queen: 120, defiler: 140, ultralisk: 176 }
const HP_SEGMENTS: Record<Mob, number> = { larva: 5, egg: 6, hatching: 8, zergling: 8, hydralisk: 9, mutalisk: 10, queen: 11, defiler: 12, ultralisk: 14 }
const dotOf = (m: Mob) => (m === 'larva' ? 'bg-[#fe8e00]' : !isHatched(m) ? 'bg-[#feeb00]' : MOB_RANK[m] >= MOB_RANK.queen ? 'bg-[#f4ffd6]' : 'bg-[#3dff6a]')

/** Plain words under the phone command row (the game names stay on desktop). */
const PHONE_LABEL: Record<string, string> = { Feed: 'Buy', Vomit: 'Sell', 'Copy CA': 'Copy CA', Morph: 'Create' }

type Group = { id: string; label: string; kinds: Mob[] }
const GROUPS: Group[] = [
  { id: '1', label: 'Larvae', kinds: ['larva'] },
  { id: '2', label: 'Eggs', kinds: ['egg', 'hatching'] },
  { id: '3', label: 'Swarm', kinds: ['zergling', 'hydralisk', 'mutalisk', 'queen', 'defiler', 'ultralisk'] },
]

const ADVISOR_LINES = [
  'Greetings, minion. The Hatchery is hungry.',
  'Select a creature to inspect it. Select a larva at the Hive to morph a token.',
  'A fed larva curls into an egg. A full curve hatches it.',
  'Hatched broods grow with market cap: zergling, hydralisk, mutalisk, queen, defiler, ultralisk.',
]

const BRIEFED = 'hatchery-briefed'
const subscribeBriefing = (cb: () => void) => {
  window.addEventListener(BRIEFED, cb)
  return () => window.removeEventListener(BRIEFED, cb)
}
const readBriefed = () => {
  try {
    return sessionStorage.getItem(BRIEFED) === '1'
  } catch {
    return false
  }
}

/** Event notices fade out on their own: with many tokens they'd pile up otherwise. Hover keeps one open. */
const NOTICE_MS = 8_000

type Notice = { id: string; title: string; body: string; mint: string; at: number }

export function CreepMap() {
  const params = useSearchParams()
  const hatched = params.get('hatched')
  const router = useRouter()
  const { publicKey } = useWallet()
  const { setVisible } = useWalletModal()
  const symbol = useQuoteSymbol()
  const larvae = useLarvae()

  // The platform's own token is the big structure in the middle; everything else takes a slot around it.
  const official = useLaunchpadConfig().data?.officialMint ?? null
  const platform = useToken(official ?? '', !!official).data ?? null
  // Every token lives on the map: load the whole list, a page at a time (capped).
  const list = useTokenList({ sort: 'new', limit: 100 })
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  const pages = list.data?.pages.length ?? 0
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && pages < MAX_PAGES) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, pages, fetchNextPage])
  const tokens = useMemo(() => (list.data?.pages.flatMap((p) => p.items) ?? []).filter((t) => t.mint !== official), [list.data, official])
  // Oldest first fixes each token's spot on the spiral; newcomers take the outer ring.
  const places = useMemo(() => {
    const byAge = [...tokens].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.mint.localeCompare(b.mint))
    return new Map(byAge.map((t, i) => [t.mint, placeOf(i, t.mint)] as const))
  }, [tokens])
  const radius = worldRadius(tokens.length)
  const { viewport, cam, size, edge, handlers, centerOn, wasDrag } = useCamera(radius)
  const focus = (mint: string) => {
    const p = places.get(mint)
    centerOn(p ? { x: p.x, y: p.y - 60 } : { x: 0, y: -60 })
  }
  // Arriving from a morph (?hatched=): fly to the new egg once it's placed.
  const flown = useRef(false)
  useEffect(() => {
    if (flown.current || !hatched || !places.has(hatched)) return
    flown.current = true
    const p = places.get(hatched)!
    centerOn({ x: p.x, y: p.y - 60 })
  }, [hatched, places, centerOn])
  // Only structures near the camera are drawn.
  const visible = tokens.filter((t) => {
    const p = places.get(t.mint)
    if (!p) return false
    return Math.abs(p.x - cam.x) < size.w / 2 / cam.z + 220 && Math.abs(p.y - cam.y) < size.h / 2 / cam.z + 260
  })
  const [selected, setSelected] = useState<string | null>(hatched)
  const [group, setGroup] = useState<string | null>(null)
  const token = (platform?.mint === selected ? platform : tokens.find((t) => t.mint === selected)) ?? null
  const grouped = group ? tokens.filter((t) => GROUPS.find((g) => g.id === group)!.kinds.includes(mobOf(t))) : []
  const [trade, setTrade] = useState<'BUY' | 'SELL' | null>(null)
  const [menu, setMenu] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const briefed = useSyncExternalStore(subscribeBriefing, readBriefed, () => true)
  const dismissBriefing = () => {
    try {
      sessionStorage.setItem(BRIEFED, '1')
    } catch {
      // Storage unavailable: it will show again next visit.
    }
    window.dispatchEvent(new Event(BRIEFED))
  }

  // Event notices (top right): a new larva on the creep, a hatch or growth, a rug.
  const [notices, setNotices] = useState<Notice[]>([])
  // What this session has already announced, so a value flapping across a
  // threshold (market cap, the quote price) can't re-announce the same thing:
  // growth is only announced past the highest form seen so far, a spawn only
  // for a mint never seen, and any notice id at most once.
  const known = useRef<Set<string> | null>(null)
  const peak = useRef<Map<string, number>>(new Map())
  const lifeBefore = useRef<Map<string, string>>(new Map())
  const announced = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (tokens.length === 0) return
    const first = known.current === null
    const seenMints = known.current ?? new Set<string>()
    known.current = seenMints
    const fresh: Omit<Notice, 'at'>[] = []
    const say = (n: Omit<Notice, 'at'>) => {
      if (first || announced.current.has(n.id)) return
      announced.current.add(n.id)
      fresh.push(n)
    }
    for (const t of tokens) {
      const mob = mobOf(t)
      const rank = MOB_RANK[mob]
      const top = peak.current.get(t.mint)
      const life = t.lifeState ?? 'ALIVE'
      if (!seenMints.has(t.mint)) {
        seenMints.add(t.mint)
        say({ id: `${t.mint}:new`, title: 'A larva has spawned', body: `$${t.symbol} is wriggling on the creep.`, mint: t.mint })
      } else if (life === 'RUGGED' && lifeBefore.current.get(t.mint) !== 'RUGGED') {
        say({ id: `${t.mint}:rugged`, title: 'A brood has been rugged', body: `$${t.symbol}: the creator dumped and it collapsed.`, mint: t.mint })
      } else if (top !== undefined && rank > top && isHatched(mob)) {
        const wasHatched = top >= MOB_RANK.zergling
        say({ id: `${t.mint}:${mob}`, title: wasHatched ? 'Evolution complete' : 'A brood has hatched', body: `$${t.symbol} is now a ${MOB_LABEL[mob]}.`, mint: t.mint })
      }
      peak.current.set(t.mint, Math.max(top ?? rank, rank))
      lifeBefore.current.set(t.mint, life)
    }
    // Reacting to new server data (an external system), not deriving render state.
    if (fresh.length) setNotices((n) => [...fresh.map((f) => ({ ...f, at: Date.now() })), ...n].slice(0, 3))
  }, [tokens])
  // Expire notices after NOTICE_MS, except the one under the pointer.
  const hoveredNotice = useRef<string | null>(null)
  const hasNotices = notices.length > 0
  useEffect(() => {
    if (!hasNotices) return
    const t = setInterval(() => {
      const now = Date.now()
      setNotices((n) => {
        const keep = n.filter((x) => x.id === hoveredNotice.current || now - x.at < NOTICE_MS)
        return keep.length === n.length ? n : keep
      })
    }, 500)
    return () => clearInterval(t)
  }, [hasNotices])

  const copyCa = async () => {
    if (!token) return
    try {
      await copyText(token.mint)
      toast.success('Contract address copied', { description: token.mint })
    } catch {
      // Some in-wallet browsers block the clipboard: show the address so it can be selected by hand.
      toast.error('Could not copy. Long-press to select:', { description: token.mint, duration: 15_000 })
    }
  }
  const select = (mint: string, fly = false) => {
    setSelected(mint)
    setGroup(null)
    if (fly) focus(mint)
  }

  // Kit icons where the meaning fits; our own glyph on an empty kit button otherwise.
  // Tiny static sprites: next/image would add nothing but a wrapper.
  // eslint-disable-next-line @next/next/no-img-element
  const kit = (name: string) => <img src={`/hud/ic-${name}.webp`} alt="" className="kit-icon" />
  const commands: { key: string; label: string; hint: string; icon: React.ReactNode; onClick?: () => void; href?: string; disabled?: boolean; framed?: boolean }[] = [
    { key: 'F', label: 'Feed', hint: 'Feed: buy the selected organism', icon: kit('ab1'), framed: true, onClick: () => (publicKey ? setTrade('BUY') : setVisible(true)), disabled: !token },
    { key: 'V', label: 'Vomit', hint: 'Vomit: sell the selected organism', icon: kit('ab2'), framed: true, onClick: () => (publicKey ? setTrade('SELL') : setVisible(true)), disabled: !token },
    { key: 'C', label: 'Chart', hint: 'Chart: its price, trades and holders', icon: kit('move'), framed: true, href: token ? `/token/${token.mint}` : undefined, disabled: !token },
    { key: 'Y', label: 'Copy CA', hint: 'Copy CA: the contract address', icon: kit('ab3'), framed: true, onClick: copyCa, disabled: !token },
    { key: 'M', label: 'Morph', hint: 'Morph: select a larva and morph a token', icon: <LarvaIcon className="size-[62%]" />, href: '/create' },
    { key: 'B', label: 'Wallet', hint: 'Wallet: your earnings as a creator', icon: <SupplyIcon className="size-[58%]" />, onClick: publicKey ? () => router.push(`/wallet/${publicKey.toBase58()}`) : () => setVisible(true) },
    { key: 'L', label: 'Swarm', hint: 'Swarm: hide creep, every token as a list', icon: kit('patrol'), framed: true, href: '/board' },
    { key: 'H', label: 'Manual', hint: 'Manual: how the Hatchery works', icon: kit('hold'), framed: true, href: '/docs' },
    { key: 'Esc', label: 'Cancel', hint: 'Cancel: deselect', icon: kit('stop'), framed: true, onClick: () => (setSelected(null), setGroup(null)), disabled: !token && !group },
  ]

  // Command hotkeys (WASD belongs to the camera). Ignored while typing or with a dialog open.
  const commandsRef = useRef(commands)
  useEffect(() => {
    commandsRef.current = commands
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName) || t.closest('[role="dialog"]')))) return
      const key = e.key === 'Escape' ? 'Esc' : e.key.toUpperCase()
      const c = commandsRef.current.find((x) => x.key === key)
      if (!c || c.disabled) return
      e.preventDefault()
      if (c.href) router.push(c.href)
      else c.onClick?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  const cursor = edge
    ? `url(/cursors/scroll-${edge}.png) ${EDGE_HOT[edge]}, auto`
    : 'url(/cursors/arrow.png) 0 0, default'

  return (
    <div className="game-cursor relative flex h-dvh min-h-0 flex-1 flex-col overflow-hidden bg-black" style={{ cursor }}>
      {/* ---- The map: an endless creep you can drag, scroll and zoom ---- */}
      <div
        ref={viewport}
        {...handlers}
        className="absolute inset-0 touch-none select-none overflow-hidden"
      >
        {/* Ground: the tiled map texture, scrolled with the camera. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/maps/melancholy-tile.webp')",
            backgroundSize: `${TILE * cam.z}px ${TILE * cam.z}px`,
            backgroundPosition: `${size.w / 2 - cam.x * cam.z}px ${size.h / 2 - cam.y * cam.z}px`,
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_55%,rgb(0_0_0/0.55)_100%)]" aria-hidden />

        {/* The world, in world pixels, moved and scaled by the camera. */}
        <div className="absolute left-1/2 top-1/2 origin-top-left" style={{ transform: `scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)` }}>
          {/* The platform token, as the big Hive at the origin, with your larvae at its feet. */}
          <div className="absolute left-0 top-0 flex w-[280px] -translate-x-1/2 -translate-y-[70%] flex-col items-center">
            <HpBar value={platform ? (platform.status === 'CURVE' ? platform.progress : 1) : 1} segments={16} />
            <button
              type="button"
              disabled={!platform}
              onClick={() => platform && !wasDrag() && select(platform.mint)}
              aria-label={platform ? `${platform.name} ($${platform.symbol}), the platform token` : 'The Hatchery'}
              className="cursor-select group relative mt-1 w-full outline-none disabled:cursor-[inherit]"
            >
              <span className="creep-blot absolute inset-x-[-22%] bottom-[-10%] h-[42%]" aria-hidden />
              {platform?.mint === selected && <span className="select-ring absolute inset-x-[-4%] bottom-[-4%] h-[30%]" aria-hidden />}
              <AnimatedSprite name="hive" className="relative w-full drop-shadow-[0_10px_12px_rgb(0_0_0/0.7)] transition-transform group-hover:scale-[1.03]" />
              {platform && (
                <span className="absolute bottom-[8%] right-[6%] size-[22%] overflow-hidden rounded-full border-2 border-[#f0a818] shadow-[0_0_10px_rgb(240_168_24/0.6)]">
                  <TokenImage src={platform.imageUrl} symbol={platform.symbol} className="size-full rounded-none border-0 shadow-none" />
                </span>
              )}
            </button>
            <span className="kit-amber mt-1 whitespace-nowrap rounded-[3px] bg-black/70 px-2 py-0.5 font-display text-xs font-bold uppercase tracking-[0.18em]">
              The Hatchery{platform && <span className="sc-text"> ${platform.symbol}</span>}
            </span>
            <div className="mt-1 flex gap-3">
              {Array.from({ length: LARVA_SLOTS }, (_, i) => {
                const d = larvae[i]
                return (
                  <Link
                    key={i}
                    href={`/create?larva=${i}`}
                    onClick={(e) => wasDrag() && e.preventDefault()}
                    draggable={false}
                    title={d?.symbol ? `Larva ${i + 1}: $${d.symbol} (draft)` : `Larva ${i + 1}: morph a token`}
                    className="cursor-select group relative rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <LarvaSprite wire={!d} className="w-14 transition-transform group-hover:scale-110" />
                    {d?.symbol && <span className="sc-text absolute -bottom-3 left-1/2 -translate-x-1/2 font-mono text-[10px]">${d.symbol}</span>}
                  </Link>
                )
              })}
            </div>
          </div>

          {visible.map((t) => (
            <MapMob
              key={t.mint}
              token={t}
              at={places.get(t.mint)!}
              selected={t.mint === selected || grouped.some((g) => g.mint === t.mint)}
              onSelect={() => !wasDrag() && select(t.mint)}
              zoom={cam.z}
            />
          ))}
        </div>

        {list.isLoading && <p className="absolute inset-x-0 top-16 text-center font-mono text-sm text-muted-foreground">&gt; scanning the creep…</p>}
        {list.isError && <p className="absolute inset-x-0 top-16 text-center font-mono text-sm text-destructive">&gt; creep signal lost. Retrying…</p>}

      </div>
      {!publicKey && !briefed && <Briefing onConnect={() => setVisible(true)} onDismiss={dismissBriefing} />}

      {/* ---- Resources, top right, floating over the map ---- */}
      <Resources />

      {/* ---- Notices, under the resources ---- */}
      <div className="pointer-events-none absolute right-2 top-[60px] z-20 flex w-72 max-w-[calc(100%-1rem)] flex-col gap-2 sm:right-3 sm:top-[70px] sm:w-80">
        {/* Desktop only: $BITCOIN paid out so far. */}
        <DistributedStat className="kit-tooltip pointer-events-auto hidden px-3 py-2.5 md:flex" />
        <MorphCall />
        {notices.map((n) => (
          <div
            key={n.id}
            className="animate-notify kit-tooltip pointer-events-auto relative overflow-hidden p-3"
            onMouseEnter={() => (hoveredNotice.current = n.id)}
            onMouseLeave={() => {
              hoveredNotice.current = null
              // Leaving restarts its clock, so it doesn't vanish the moment the pointer moves off.
              setNotices((x) => x.map((y) => (y.id === n.id ? { ...y, at: Date.now() } : y)))
            }}
          >
            {/* Time left before it closes. */}
            <span
              key={n.at}
              className="notice-timer absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#f0a818]/70"
              style={{ animationDuration: `${NOTICE_MS}ms` }}
              aria-hidden
            />
            <p className="kit-amber font-display text-base font-bold">{n.title}</p>
            <p className="mt-1 text-sm text-foreground">{n.body}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="kit-small kit-plate kit-amber h-9 font-display text-sm font-bold" onClick={() => (select(n.mint, true), setNotices((x) => x.filter((y) => y.id !== n.id)))}>
                Select
              </button>
              <button type="button" className="kit-small kit-plate kit-amber h-9 font-display text-sm font-bold" onClick={() => setNotices((x) => x.filter((y) => y.id !== n.id))}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ---- The bottom HUD (frames cut from the licensed HUD kit, see scripts/hud-kit-*.py) ---- */}
      <div className="absolute inset-x-0 bottom-0 z-10 grid items-end gap-1 bg-[linear-gradient(0deg,#000_0,#000_60%,transparent)] px-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-6 md:grid-cols-[250px_minmax(0,1fr)_176px_262px] md:bg-[linear-gradient(0deg,#000_0,#000_55%,transparent)] md:px-2 md:pb-1 md:pt-10">
        {/* Minimap with F1/F2 above it (desktop; on a phone you drag the map). */}
        <div className="relative hidden h-[230px] md:block">
          <div className="absolute -top-9 left-2 hidden gap-1.5 md:flex">
            <Link
              href="/"
              className="kit-small kit-slot kit-amber flex h-8 items-center gap-1.5 px-3 font-display text-[12px] font-bold uppercase tracking-[0.12em] [text-shadow:0_0_8px_rgb(240_168_24/0.6)]"
              title="F1: the creep (this map)"
            >
              <span className="text-[#feeb00]">F1</span> Creep
            </Link>
            <Link
              href="/board"
              className="kit-small kit-slot flex h-8 items-center gap-1.5 px-3 font-display text-[12px] font-bold uppercase tracking-[0.12em] text-foreground transition-colors hover:text-[#ffd98a]"
              title="F2: the swarm list (every token as a list)"
            >
              <span className="text-[#feeb00]">F2</span> Swarm
            </Link>
          </div>
          <div className="kit-frame kit-minimap size-full">
            <Minimap tokens={tokens} places={places} radius={radius} cam={cam} view={size} selected={selected} onSelect={(m) => select(m, true)} onJump={centerOn} />
          </div>
        </div>

        {/* Info panel with the control groups and the game clock on its top edge. On a phone only while something is selected. */}
        <div className={cn('relative h-[176px] min-w-0 md:block md:h-[200px]', !token && !group && 'hidden')}>
          <div className="absolute -top-7 left-8 z-10 hidden gap-1 md:flex">
            {GROUPS.map((g) => {
              const n = tokens.filter((t) => g.kinds.includes(mobOf(t))).length
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => (setGroup(g.id), setSelected(null))}
                  disabled={n === 0}
                  title={`${g.label} (${n})`}
                  className={cn('kit-small kit-slot flex h-7 items-center gap-1 whitespace-nowrap px-2.5 font-mono text-[11px] text-foreground/70 disabled:opacity-40', group === g.id && 'kit-amber')}
                >
                  {g.id} {g.label} <span className="kit-amber">{n}</span>
                </button>
              )
            })}
          </div>
          <GameClock />
          <div className="kit-frame kit-info flex size-full px-[22px] py-[18px] md:px-[30px] md:py-[22px]">
            <SelectionPanel token={token} group={grouped} symbol={symbol} hatched={hatched === token?.mint} onPick={select} />
          </div>
        </div>

        {/* Portrait. */}
        <div className="kit-frame kit-portrait hidden h-[200px] px-[24px] py-[26px] md:block">
          <div className="size-full overflow-hidden bg-black">
            {token ? <TokenImage src={token.imageUrl} symbol={token.symbol} className="size-full rounded-none border-0 shadow-none" /> : <CerebratePortrait className="size-full" />}
          </div>
        </div>

        {/* Phone: one row of commands plus the menu. */}
        <div className="flex items-start justify-between gap-0.5 md:hidden">
          {commands
            .filter((c) => c.key !== 'Esc' && c.key !== 'H')
            .map((c) => {
              const cls = cn('kit-btn size-10 shrink-0', c.framed && '!bg-none', c.disabled && 'pointer-events-none opacity-40')
              const btn =
                c.href && !c.disabled ? (
                  <Link href={c.href} className={cls} aria-label={c.hint}>
                    {c.icon}
                  </Link>
                ) : (
                  <button type="button" onClick={c.onClick} disabled={c.disabled} className={cls} aria-label={c.hint}>
                    {c.icon}
                  </button>
                )
              return (
                <div key={c.label} className="flex w-10 flex-col items-center gap-0.5">
                  {btn}
                  <span className={cn('whitespace-nowrap font-display text-[8px] font-bold uppercase leading-none tracking-wide text-[#ffd98a]', c.disabled && 'opacity-40')} aria-hidden>
                    {PHONE_LABEL[c.label] ?? c.label}
                  </span>
                </div>
              )
            })}
          <div className="flex w-10 flex-col items-center gap-0.5">
            <button type="button" onClick={() => setMenu(true)} className="kit-small size-10 shrink-0 bg-[url(/hud/sb-menu.webp)]" aria-label="Menu" />
            <span className="font-display text-[8px] font-bold uppercase leading-none tracking-wide text-[#ffd98a]" aria-hidden>
              Menu
            </span>
          </div>
        </div>

        {/* Command panel: 3x3 kit buttons, the tooltip line and the menu row above it. */}
        <div className="relative hidden h-[210px] md:block">
          <div className="absolute -top-9 right-1 hidden items-center gap-1 md:flex">
            <Link href="/docs" className="kit-small size-8 bg-[url(/hud/sb-alert.webp)]" aria-label="Help: the manual" />
            <a href={HPOSPAD_TG_URL} target="_blank" rel="noopener noreferrer" className="kit-small size-8 bg-[url(/hud/sb-chat.webp)]" aria-label="Comms: the Telegram group" title="Telegram" />
            <span className="[&_.wallet-adapter-button]:!h-8">
              <WalletMultiButton />
            </span>
            <button type="button" onClick={() => setMenu(true)} className="kit-small size-8 bg-[url(/hud/sb-menu.webp)]" aria-label="Menu" />
          </div>
          <div className="kit-frame kit-command size-full">
            <div className="absolute inset-[11%_7%_7%_14%] grid grid-cols-3 grid-rows-3 gap-[3%]">
              {commands.map((c) => {
                const cls = cn('kit-btn', c.framed && '!bg-none', c.disabled && 'pointer-events-none')
                const inner = (
                  <>
                    {c.icon}
                    <span className="absolute left-1 top-0.5 font-mono text-[9px] text-[#feeb00] [text-shadow:0_1px_1px_#000]">{c.key}</span>
                  </>
                )
                const hover = { onMouseEnter: () => setHint(c.hint), onMouseLeave: () => setHint(null), onFocus: () => setHint(c.hint), onBlur: () => setHint(null) }
                return c.href && !c.disabled ? (
                  <Link key={c.label} href={c.href} className={cls} aria-label={c.hint} {...hover}>
                    {inner}
                  </Link>
                ) : (
                  <button key={c.label} type="button" onClick={c.onClick} disabled={c.disabled} aria-disabled={c.disabled} className={cls} aria-label={c.hint} {...hover}>
                    {inner}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip for the hovered command, like the game's. */}
      {hint && (
        <div className="kit-tooltip pointer-events-none absolute bottom-[244px] right-3 z-20 hidden max-w-xs px-3 py-2 md:block" role="tooltip">
          <p className="kit-amber font-display text-base font-bold">{hint.split(':')[0]}</p>
          <p className="text-sm text-foreground/85">{hint.split(':').slice(1).join(':').trim()}</p>
        </div>
      )}

      <GameMenu open={menu} onOpenChange={setMenu} />
      <Dialog open={!!trade && !!token} onOpenChange={(o) => !o && setTrade(null)}>
        <DialogContent className="max-w-md p-2">
          <DialogTitle className="sr-only">{trade === 'SELL' ? 'Vomit (sell)' : 'Feed (buy)'} ${token?.symbol}</DialogTitle>
          {token && trade && <TradePanel key={trade} token={token} initialSide={trade} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** A segmented bar like a unit's hit points. `value` 0..1. */
function HpBar({ value, segments = 10, tone = 'on' }: { value: number; segments?: number; tone?: 'on' | 'on-shield' | 'on-warn' | 'on-dead' }) {
  // At least one segment is always lit, so a brand-new curve still reads as alive.
  const lit = Math.max(1, Math.round(Math.max(0, Math.min(1, value)) * segments))
  return (
    <span className="hp" aria-hidden>
      {Array.from({ length: segments }, (_, i) => (
        <i key={i} className={i < lit ? tone : undefined} />
      ))}
    </span>
  )
}

/** One token on the map, as a mob. Plays the transformation when it grows (curl into an egg, a hatch, a bigger creature). */
function MapMob({ token, at, selected, onSelect, zoom }: { token: TokenDTO; at: Vec; selected: boolean; onSelect: () => void; zoom: number }) {
  const mob = mobOf(token)
  const prev = useRef(mob)
  const [grow, setGrow] = useState(0)
  useEffect(() => {
    const was = prev.current
    prev.current = mob
    if (MOB_RANK[mob] <= MOB_RANK[was]) return
    // It grew on the server: play the transformation once (keyed, so it restarts).
    setGrow((g) => g + 1)
  }, [mob])
  const growing = grow > 0
  // Life: a rugged token bursts once, then stays a black husk; a dead one drains to grey.
  const life = token.lifeState ?? 'ALIVE'
  const wasLife = useRef(life)
  const [bursting, setBursting] = useState(false)
  useEffect(() => {
    if (wasLife.current === life) return
    wasLife.current = life
    if (life !== 'RUGGED') return
    // The server says it just got rugged: play the burst once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBursting(true)
    const t = setTimeout(() => setBursting(false), 1600)
    return () => clearTimeout(t)
  }, [life])
  // Curve progress for a live curve; a graduated organism is at full health; a rug has none left.
  const hp = life === 'RUGGED' ? 0 : token.status === 'CURVE' ? token.progress : 1
  // HPOS10I this token has paid out so far: its creator's share plus any holder reflections.
  const paid = Number(token.creatorEarnedQuote) + Number(token.reflectedTotalQuote)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${token.name} ($${token.symbol}), ${MOB_LABEL[mob]}`}
      draggable={false}
      className="cursor-select group absolute flex -translate-x-1/2 -translate-y-full flex-col items-center outline-none"
      style={{ left: at.x, top: at.y }}
    >
      <HpBar value={hp} segments={HP_SEGMENTS[mob]} tone={life === 'RUGGED' ? 'on-dead' : mob === 'hatching' ? 'on-warn' : 'on'} />
      {/* Labels above the health bar: HPOS10I paid out, then the name. Zoomed out they grow
          back (up to 2x) so they stay readable. */}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 mb-1 flex flex-col items-center gap-0.5"
        style={{ transform: `translateX(-50%) scale(${Math.min(2, Math.max(1, 1 / zoom))})`, transformOrigin: '50% 100%' }}
      >
        <span
          className={cn(
            'flex items-center gap-1 whitespace-nowrap rounded-[2px] bg-black/70 px-1.5 py-px font-mono text-[10px] leading-tight',
            paid > 0 ? 'text-[#3dff6a]' : 'text-foreground/45',
          )}
          title={`${paid.toLocaleString()} ${QUOTE_TICKER} paid out by this token`}
        >
          <QuoteIcon className="size-3" />
          {paid > 0 ? `+${formatCompact(paid)}` : '0'} paid
        </span>
        <span
          className={cn(
            'kit-amber max-w-[160px] truncate whitespace-nowrap rounded-[2px] bg-black/75 px-1.5 py-px font-mono text-[11px] leading-tight group-hover:bg-black/90',
            selected && 'sc-text ring-1 ring-[#3dff6a]/60',
            life === 'RUGGED' && '!text-[#ff4a3d] ring-1 ring-[#f40000]/60',
            life === 'DEAD' && '!text-foreground/50',
          )}
        >
          {life === 'RUGGED' && '☠ '}${token.symbol}
          {life !== 'ALIVE' && <span className="opacity-80"> · {life}</span>}
        </span>
      </span>
      {/* Flyers hover (mob-fly), so leave them headroom under the health bar. */}
      <span className={cn('relative mt-1 block transition-transform group-hover:scale-105 group-focus-visible:scale-105', FLYERS.has(mob) && life === 'ALIVE' && 'mt-9')} style={{ width: SIZE[mob] }}>
        <span className={cn('creep-blot absolute inset-x-[-24%] bottom-[-12%] h-[46%]', life === 'RUGGED' && 'brightness-0')} aria-hidden />
        {selected && <span className="select-ring absolute inset-x-[-8%] bottom-[-6%] h-[32%]" aria-hidden />}
        <MobSprite
          key={grow}
          mob={mob}
          grow={growing && life === 'ALIVE'}
          still={life !== 'ALIVE'}
          className={cn('relative w-full drop-shadow-[0_6px_8px_rgb(0_0_0/0.7)]', mob === 'hatching' && life === 'ALIVE' && 'crt-flicker', life === 'RUGGED' && 'husk', life === 'DEAD' && 'drained')}
        />
        {bursting && <AnimatedSprite name="splat" once className="pointer-events-none absolute bottom-[-10%] left-1/2 w-[110%] -translate-x-1/2" />}
        {/* The coin's own face, as a badge on the organism. */}
        <span className={cn('absolute -right-[10%] bottom-0 aspect-square w-[28%] min-w-6 overflow-hidden rounded-full border-2 border-[#f0a818] shadow-[0_0_8px_rgb(0_0_0/0.8)]', life === 'RUGGED' && 'border-[#f40000] grayscale', life === 'DEAD' && 'grayscale')}>
          <TokenImage src={token.imageUrl} symbol={token.symbol} className="size-full rounded-none border-0 shadow-none" />
        </span>
      </span>
      {token.holders > 25 && life === 'ALIVE' && <DroneSprite className="absolute -left-6 bottom-0 w-8 lg:w-9" />}
    </button>
  )
}

/** The whole world in a box: a dot per structure, the camera's view, click or drag to move it. */
function Minimap({
  tokens,
  places,
  radius,
  cam,
  view,
  selected,
  onSelect,
  onJump,
}: {
  tokens: TokenDTO[]
  places: Map<string, Vec>
  radius: number
  cam: Cam
  view: { w: number; h: number }
  selected: string | null
  onSelect: (m: string) => void
  onJump: (p: Vec) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const span = radius * 2
  const pct = (v: number) => `${((v + radius) / span) * 100}%`
  const toWorld = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * span - radius, y: ((e.clientY - r.top) / r.height) * span - radius }
  }
  const vw = view.w / cam.z
  const vh = view.h / cam.z
  return (
    <div
      ref={box}
      className="creep-mini absolute inset-[13%_16%_8%_5%] touch-none overflow-hidden"
      role="group"
      aria-label="Minimap: click or drag to move the camera"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).dataset.dot) return
        e.currentTarget.setPointerCapture(e.pointerId)
        onJump(toWorld(e))
      }}
      onPointerMove={(e) => e.buttons === 1 && e.currentTarget.hasPointerCapture(e.pointerId) && onJump(toWorld(e))}
    >
      <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-[#feeb00] shadow-[0_0_6px_#feeb00]" style={{ left: pct(0), top: pct(0) }} aria-hidden />
      {tokens.map((t) => {
        const p = places.get(t.mint)
        if (!p) return null
        return (
          <button
            key={t.mint}
            type="button"
            data-dot="1"
            onClick={() => onSelect(t.mint)}
            aria-label={`Select $${t.symbol}`}
            className={cn('absolute size-[5px] -translate-x-1/2 -translate-y-1/2 outline-none', t.lifeState === 'RUGGED' ? 'bg-[#f40000]' : t.lifeState === 'DEAD' ? 'bg-[#555]' : dotOf(mobOf(t)), selected === t.mint && 'z-10 size-2 ring-2 ring-white')}
            style={{ left: pct(p.x), top: pct(p.y) }}
          />
        )
      })}
      {/* The camera's view. */}
      <span
        className="pointer-events-none absolute border border-white/80"
        style={{ left: pct(cam.x - vw / 2), top: pct(cam.y - vh / 2), width: `${(vw / span) * 100}%`, height: `${(vh / span) * 100}%` }}
        aria-hidden
      />
    </div>
  )
}

/** Time since you entered the creep, mm:ss, like a match clock. */
function GameClock() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setT(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="kit-small kit-slot absolute -top-7 right-8 z-10 hidden h-7 px-3 font-mono text-sm tabular-nums text-foreground md:grid">
      {Math.floor(t / 60)}:{String(t % 60).padStart(2, '0')}
    </span>
  )
}

function SelectionPanel({ token, group, symbol, hatched, onPick }: { token: TokenDTO | null; group: TokenDTO[]; symbol: string; hatched: boolean; onPick: (m: string) => void }) {
  const [line, setLine] = useState(0)
  useEffect(() => {
    if (token || group.length) return
    const t = setInterval(() => setLine((l) => (l + 1) % ADVISOR_LINES.length), 6000)
    return () => clearInterval(t)
  }, [token, group.length])

  // A control group: the grid of wireframe tiles, yellow when the curve is still low.
  if (!token && group.length) {
    return (
      <div className="flex flex-1 flex-wrap content-start justify-center gap-1.5 overflow-y-auto p-1">
        {group.map((t) => {
          const mob = mobOf(t)
          const low = t.status === 'CURVE' && t.progress < 1 / 3
          return (
            <button key={t.mint} type="button" onClick={() => onPick(t.mint)} title={`$${t.symbol}`} className={cn('kit-btn size-14', low && 'hue-rotate-[-25deg]')}>
              <MobSprite mob={mob} still className="wireframe w-12" />
            </button>
          )
        })}
      </div>
    )
  }

  if (!token) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-2 text-center">
        <p className="font-display text-lg font-bold kit-amber">Cerebrate</p>
        <p className="sc-text max-w-lg font-mono text-sm" aria-live="polite">
          {ADVISOR_LINES[line]}
          <span className="animate-pulse-dot">_</span>
        </p>
      </div>
    )
  }

  const mob = mobOf(token)
  const hp = token.status === 'CURVE' ? token.progress : 1
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[64px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[130px_minmax(0,1fr)] sm:gap-4">
      <div className="flex flex-col items-center">
        <MobSprite mob={mob} still className="wireframe w-full max-w-[110px]" />
        <p className="sc-text mt-1 font-mono text-[11px] sm:text-sm">{Math.round(hp * 1000)} / 1000</p>
      </div>
      <div className="flex min-w-0 flex-col items-center gap-1 text-center sm:gap-1.5">
        <p className="sc-text max-w-full truncate font-display text-base font-bold sm:text-xl">
          {MOB_LABEL[mob]} <span className="kit-amber">${token.symbol}</span>
        </p>
        <p className="max-w-full truncate text-xs text-foreground/80 sm:text-sm">{token.name}</p>
        {hatched && <p className="sc-text font-mono text-xs">Your egg is gestating. Feed it and it will grow.</p>}
        <dl className="grid max-w-full grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-xs sm:gap-x-6 sm:text-sm lg:grid-cols-3">
          <Readout k="MC" v={token.marketCapUsd !== null ? formatUsd(token.marketCapUsd) : `${formatCompact(token.marketCapQuote)} ${symbol}`} />
          <Readout k="Holders" v={String(token.holders)} />
          <Readout k="Morph" v={token.status === 'CURVE' ? `${(token.progress * 100).toFixed(1)}%` : token.status === 'COMPLETE' ? 'mutating' : 'done'} />
          <Readout k="24h" v={`${formatCompact(token.volume24hQuote)} ${symbol}`} />
          <Readout k="Creator" v={formatCompact(token.creatorEarnedQuote)} icon wide />
          {/* The contract address, with its copy button (phones too). */}
          <div className="col-span-2 flex min-w-0 items-center justify-center gap-1 lg:col-span-1">
            <dt className="shrink-0 text-foreground/60">CA:</dt>
            <dd>
              <CopyButton value={token.mint} label={shortAddress(token.mint)} toastText="Contract address copied" className="px-1 py-0 text-foreground" />
            </dd>
          </div>
          <Readout k="Dev sold" v={`${Math.round((token.creatorSold ?? 0) * 100)}%`} />
        </dl>
        {token.lifeState === 'RUGGED' && <p className="font-mono text-sm font-bold text-[#ff4a3d]">☠ RUGGED: the creator dumped and it collapsed.</p>}
        {token.lifeState === 'DEAD' && <p className="font-mono text-sm text-foreground/60">DEAD: no trades for a day. One trade revives it.</p>}
      </div>
    </div>
  )
}

function Readout({ k, v, icon, wide }: { k: string; v: string; icon?: boolean; wide?: boolean }) {
  return (
    <div className={cn('min-w-0 items-baseline justify-center gap-1.5', wide ? 'hidden sm:flex' : 'flex')}>
      <dt className="shrink-0 text-foreground/60">{k}:</dt>
      <dd className="flex min-w-0 items-center gap-1 truncate text-foreground">
        {icon && <QuoteIcon className="size-3.5" />}
        {v}
      </dd>
    </div>
  )
}

/** Top-right resource counters: SOL (minerals), HPOS10I (gas), swarm (supply). */
function Resources() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const { data: config } = useLaunchpadConfig()
  const stats = useStats()
  const sol = useQuery({
    queryKey: ['sol-balance', publicKey?.toBase58()],
    enabled: !!publicKey,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => (await connection.getBalance(publicKey!)) / 1e9,
  })
  const quote = useTokenBalance(config?.quote.mint ?? '11111111111111111111111111111111')
  // Numbers sit next to the kit bar's own crystal, canister and supply icons.
  const num = 'absolute top-1/2 -translate-y-1/2 font-display text-[15px] font-bold tabular-nums text-foreground [text-shadow:0_1px_2px_#000]'
  return (
    <div className="kit-resbar absolute right-2 top-2 z-20 aspect-[900/121] w-[420px] max-w-[calc(100%-1rem)]">
      <span className={cn(num, 'left-[17%]')} title="SOL in your wallet">
        {publicKey ? (sol.data ?? 0).toFixed(2) : '—'}
      </span>
      <span className={cn(num, 'left-[46.5%] flex items-center gap-1')} title={`${quoteDisplaySymbol(config?.quote.symbol)} in your wallet`}>
        {publicKey && config ? formatCompact(String(quote.data?.ui ?? 0)) : '—'}
      </span>
      <span className={cn(num, 'left-[76.5%]')} title="Swarm: graduated / tokens on the creep">
        {stats.data ? `${formatCompact(stats.data.graduated)}/${formatCompact(stats.data.tokens)}` : '—'}
      </span>
    </div>
  )
}

/**
 * The pinned notice, top right, for everyone: a larva inviting you to morph
 * your own token. Connected wallets go straight to the Morph screen; without
 * one it opens the wallet picker, then continues to the Morph screen once the
 * wallet connects.
 */
function MorphCall() {
  const router = useRouter()
  const { publicKey } = useWallet()
  const { setVisible } = useWalletModal()
  const creatorBps = useLaunchpadConfig().data?.fees.creatorBps
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (pending && publicKey) router.push('/create')
  }, [pending, publicKey, router])
  return (
    // Phones: hidden (it covered the map); the Morph command in the bottom row does the same job.
    <div className="kit-tooltip pointer-events-auto hidden items-center gap-3 p-3 sm:flex">
      <Link href="/create" className="cursor-select shrink-0" aria-hidden tabIndex={-1}>
        <LarvaSprite className="w-16" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="kit-amber font-display text-base font-bold leading-tight">A larva awaits</p>
        <p className="mt-0.5 text-xs leading-snug text-foreground/85">
          Morph your own token{creatorBps ? ` and earn ${creatorBps / 100}% of every trade` : ''}.
        </p>
        {publicKey ? (
          <Link href="/create" className="kit-small kit-plate-lit mt-2 flex h-9 items-center justify-center font-display text-sm font-bold text-[#fff3c4]">
            Morph a token
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => (setPending(true), setVisible(true))}
            className="kit-small kit-plate-lit mt-2 h-9 w-full font-display text-sm font-bold text-[#fff3c4]"
          >
            Connect wallet to morph
          </button>
        )}
      </div>
    </div>
  )
}

function Briefing({ onConnect, onDismiss }: { onConnect: () => void; onDismiss: () => void }) {
  const full = 'Greetings, minion. The Hatchery is hungry.'
  const [n, setN] = useState(0)
  useEffect(() => {
    if (n >= full.length) return
    const t = setTimeout(() => setN((x) => x + 1), 45)
    return () => clearTimeout(t)
  }, [n])
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]">
      <div className="kit-tooltip w-full max-w-lg">
        <p className="kit-amber border-b border-[#f0a818]/50 px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.2em]">Incoming transmission</p>
        <div className="flex gap-4 p-4">
          <div className="kit-frame kit-portrait size-28 shrink-0 px-[14px] py-[16px] sm:size-32">
            <CerebratePortrait className="size-full" />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="font-display text-sm font-bold uppercase tracking-[0.14em] kit-amber">Cerebrate</p>
            <p className="sc-text min-h-12 font-mono text-base" aria-live="polite">
              {full.slice(0, n)}
              <span className="animate-pulse-dot">_</span>
            </p>
            <p className="text-sm text-muted-foreground">Connect a wallet to morph larvae and feed the brood.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onConnect} className="kit-small kit-plate-lit h-10 font-display text-sm font-bold text-[#fff3c4]">
                Connect
              </button>
              <button type="button" onClick={onDismiss} className="kit-small kit-plate kit-amber h-10 font-display text-sm font-bold">
                Observe
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
