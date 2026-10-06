import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { GATE_NEXT_HEADER, safeNext } from '@/lib/gate'
import { HPOSPAD_TG_HANDLE, HPOSPAD_TG_URL, HPOSPAD_X_HANDLE, HPOSPAD_X_URL } from '@/lib/constants'
import { AnimatedSprite, LarvaSprite } from '@/components/creep/sprites'
import { TelegramLogo, XLogo } from '@/components/x-link'
import { Input } from '@/components/ui/input'

export const metadata: Metadata = {
  title: 'Coming soon',
  robots: { index: false, follow: false },
}

/**
 * The pre-launch screen (lib/gate.ts). The proxy renders it in place of every
 * page until the visitor enters the password; it covers the whole viewport,
 * the game bar included.
 */
export default async function SoonPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next: nextParam } = await searchParams
  const next = safeNext((await headers()).get(GATE_NEXT_HEADER) ?? nextParam)
  return (
    <div className="creep-ground fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black p-4">
      <div
        className="pointer-events-none absolute inset-0 bg-[url('/maps/melancholy-tile.webp')] bg-[length:1400px] opacity-60"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_20%,rgb(0_0_0/0.75)_70%,#000_100%)]" aria-hidden />

      <main className="kit-tooltip relative flex w-full max-w-md flex-col items-center gap-5 px-6 py-8 text-center">
        <p className="kit-amber font-mono text-[11px] uppercase tracking-[0.3em]">Incoming transmission</p>

        <div className="relative flex h-28 w-full items-end justify-center gap-3">
          <span className="select-ring absolute bottom-[-6%] left-1/2 h-8 w-40 -translate-x-1/2" aria-hidden />
          <LarvaSprite className="relative w-16 -scale-x-100" />
          <AnimatedSprite name="egg" className="relative w-24 drop-shadow-[0_8px_10px_rgb(0_0_0/0.7)]" />
          <LarvaSprite className="relative w-16" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="kit-title font-display text-3xl font-black uppercase tracking-[0.08em] sm:text-4xl">The Hatchery</h1>
          <p className="sc-text font-mono text-sm">
            &gt; the brood is gestating<span className="animate-pulse-dot">_</span>
          </p>
          <p className="font-display text-xl font-bold uppercase tracking-[0.2em] text-[#ffd98a]">Coming soon</p>
          <p className="text-sm text-muted-foreground">A memecoin launchpad on Solana where every token is a creature that grows with its market cap.</p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2">
          {[
            { href: HPOSPAD_X_URL, label: HPOSPAD_X_HANDLE, Logo: XLogo },
            { href: HPOSPAD_TG_URL, label: HPOSPAD_TG_HANDLE, Logo: TelegramLogo },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="kit-button kit-button-dark flex h-10 items-center justify-center gap-2 px-2 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <l.Logo /> {l.label}
            </a>
          ))}
        </div>

        <form action="/api/gate" method="post" className="flex w-full flex-col gap-2 border-t border-[#f0a818]/30 pt-5">
          <label htmlFor="gate-password" className="kit-amber text-left font-display text-[11px] font-bold uppercase tracking-[0.2em]">
            Early access
          </label>
          <input type="hidden" name="next" value={next} />
          <div className="flex gap-2">
            <Input id="gate-password" name="password" type="password" autoComplete="current-password" placeholder="Password" required aria-invalid={e ? true : undefined} />
            <button type="submit" className="kit-small kit-plate-lit h-10 shrink-0 px-5 font-display text-sm font-bold text-[#fff3c4]">
              Enter
            </button>
          </div>
          {e && <p className="text-left font-mono text-xs text-destructive">&gt; wrong password</p>}
        </form>
      </main>
    </div>
  )
}
