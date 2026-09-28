'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { BookOpen, Code2, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HPOSPAD_TG_HANDLE, HPOSPAD_TG_URL, HPOSPAD_X_HANDLE, HPOSPAD_X_URL } from '@/lib/constants'
import { TelegramLogo, XLogo } from '@/components/x-link'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { GasIcon, HatcheryIcon, LarvaIcon } from '@/components/sc/icons'

/** The game menu: navigation, links and the risk notice (there is no footer). */
export function GameMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { publicKey } = useWallet()
  const pathname = usePathname()
  const setMenu = onOpenChange
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0">
          <DialogTitle className="border-b border-[#f0a818]/50 px-4 py-2.5 text-xs tracking-[0.24em]">Game menu</DialogTitle>
          <DialogDescription className="sr-only">Navigation and risk notice</DialogDescription>
          <div className="px-4 pb-4">
          <nav className="mt-4 grid grid-cols-2 gap-2">
            {[
              { href: '/', label: 'The creep', Icon: HatcheryIcon },
              { href: '/create', label: 'Morph', Icon: LarvaIcon },
              { href: '/board', label: 'Swarm list', Icon: LayoutGrid },
              ...(publicKey ? [{ href: `/wallet/${publicKey.toBase58()}`, label: 'My earnings', Icon: GasIcon }] : []),
              { href: '/docs', label: 'Manual', Icon: BookOpen },
              { href: '/docs/api', label: 'API', Icon: Code2 },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenu(false)}
                aria-current={(l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)) ? 'page' : undefined}
                className={cn(
                  'kit-button kit-button-dark flex h-11 items-center gap-2 px-4 font-display text-[12px] font-bold uppercase tracking-[0.14em] outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4',
                  (l.href === '/' ? pathname === '/' : pathname.startsWith(l.href)) && 'kit-button-lit',
                )}
              >
                <l.Icon /> {l.label}
              </Link>
            ))}
            {[
              { href: HPOSPAD_X_URL, label: HPOSPAD_X_HANDLE, Logo: XLogo },
              { href: HPOSPAD_TG_URL, label: HPOSPAD_TG_HANDLE, Logo: TelegramLogo },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="kit-button kit-button-dark flex h-11 items-center justify-center gap-2 px-3 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <l.Logo /> {l.label}
              </a>
            ))}
          </nav>
          <p className="kit-well mt-4 p-3 text-xs leading-relaxed text-muted-foreground">
            Tokens morphed on The Hatchery are created by independent users. They are highly speculative and can lose all
            value. Creator earnings depend entirely on trading volume and are never guaranteed. Nothing here is financial
            advice. Always verify the contract address before you trade.
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Map terrain: Melancholy by Alexandre Coderre-Chabot,{' '}
            <a href="https://acodcha.github.io/sc/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              acodcha.github.io/sc
            </a>
            , licensed{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              CC BY 4.0
            </a>
            .
          </p>
          </div>
        </DialogContent>
      </Dialog>
  )
}
