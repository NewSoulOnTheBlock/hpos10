'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useStats } from '@/hooks/use-tokens'
import { useLaunchpadConfig } from '@/hooks/use-config'
import { useTokenBalance } from '@/hooks/use-token-balance'
import { useRealtimeStatus } from '@/hooks/use-websocket'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SprotoAvatar } from '@/components/sproto-avatar'
import { GameMenu } from '@/components/game-menu'
import { HatcheryIcon } from '@/components/sc/icons'

// The wallet button reads window-only state; render it client-side to avoid hydration drift.
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((m) => m.WalletMultiButton),
  { ssr: false, loading: () => <div className="h-[34px] w-32 bg-[url(/hud/btn-normal.webp)] bg-[length:100%_100%] opacity-60" /> },
)

/**
 * The only chrome on every screen, like a game's top HUD: the crest, your
 * resources (SOL, HPOS10I), the swarm counter, your wallet and MENU. MENU
 * holds navigation and the risk notice that used to live in the footer.
 */
export function GameBar() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const { data: config } = useLaunchpadConfig()
  const stats = useStats()
  const live = useRealtimeStatus()
  const [menu, setMenu] = useState(false)
  const pathname = usePathname()

  const sol = useQuery({
    queryKey: ['sol-balance', publicKey?.toBase58()],
    enabled: !!publicKey,
    refetchInterval: 20_000,
    queryFn: async () => (await connection.getBalance(publicKey!)) / 1e9,
  })
  const quote = useTokenBalance(config?.quote.mint ?? '11111111111111111111111111111111')

  // The creep is a full-screen game view with its own HUD.
  if (pathname === '/') return null
  // Numbers sit just right of the kit bar's own crystal (~9%), canister (~41%) and supply (~72%) icons.
  const num =
    'absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-display text-[11px] leading-none font-bold tabular-nums text-foreground [text-shadow:0_1px_2px_#000] sm:text-[14px]'

  return (
    <header className="kit-topbar sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-2 px-2 sm:gap-3 sm:px-3">
        <Link href="/" aria-label="The Hatchery: back to the creep" className="relative flex shrink-0 items-center gap-2 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <HatcheryIcon className="size-7" />
          <span
            className={cn('absolute left-0 top-0 size-1.5 rounded-full', live ? 'animate-pulse-dot bg-[#3dff6a] shadow-[0_0_6px_#3dff6a]' : 'bg-[#3a3631]')}
            title={live ? 'Live feed connected' : 'Live feed offline'}
          />
          <span className="kit-amber hidden font-display text-sm font-extrabold uppercase tracking-[0.16em] xl:block">The Hatchery</span>
        </Link>

        {/* Keeps the kit bar's proportions (900x121) so its icons never squash; shrinks on narrow screens. */}
        <div className="kit-resbar relative aspect-[900/121] w-[380px] min-w-0 shrink" role="group" aria-label="Resources">
          <span className={cn(num, 'left-[17%]')} title="SOL in your wallet">
            <span className="sr-only">SOL </span>
            {publicKey ? (sol.data ?? 0).toFixed(2) : '—'}
          </span>
          <span className={cn(num, 'left-[46.5%]')} title={`${config?.quote.symbol ?? 'HPOS10I'} in your wallet`}>
            <span className="sr-only">{config?.quote.symbol ?? 'HPOS10I'} </span>
            {publicKey && config ? formatCompact(String(quote.data?.ui ?? 0)) : '—'}
          </span>
          <span className={cn(num, 'left-[76.5%]')} title="Swarm: graduated / tokens on the creep">
            <span className="sr-only">Swarm </span>
            {stats.data ? `${formatCompact(stats.data.graduated)}/${formatCompact(stats.data.tokens)}` : '—'}
          </span>
        </div>

        <div className="ml-auto flex h-[34px] shrink-0 items-center gap-2">
          {publicKey && (
            <Link
              href={`/wallet/${publicKey.toBase58()}`}
              aria-label="My earnings"
              title="My earnings"
              className="hidden size-[34px] overflow-hidden rounded-[4px] border-2 border-[#f0a818] shadow-[0_0_0_1px_#000,0_0_8px_rgb(240_168_24/0.35)] outline-none focus-visible:ring-2 focus-visible:ring-ring sm:block"
            >
              <SprotoAvatar address={publicKey.toBase58()} title="Your Sproto avatar" className="size-full rounded-none border-0 shadow-none" />
            </Link>
          )}
          <span className="kit-wallet flex h-[34px] items-center">
            <WalletMultiButton />
          </span>
          <Link href="/board" className="kit-small hidden size-[34px] bg-[url(/hud/sb-chat.webp)] sm:grid" aria-label="Comms: the swarm list" title="Swarm list" />
          <button type="button" onClick={() => setMenu(true)} className="kit-small size-[34px] bg-[url(/hud/sb-menu.webp)]" aria-label="Menu" title="Menu" />
        </div>
      </div>

      <GameMenu open={menu} onOpenChange={setMenu} />
    </header>
  )
}
