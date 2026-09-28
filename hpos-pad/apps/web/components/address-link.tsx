'use client'

import Link from 'next/link'
import { shortAddress } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SprotoAvatar } from '@/components/sproto-avatar'

const linkClass =
  'rounded-[2px] font-mono text-sm text-muted-foreground transition-colors outline-none hover:text-[#f0a818] focus-visible:ring-2 focus-visible:ring-ring'

/** Links a wallet (with its Sproto avatar) to its Hatchery earnings page. */
export function WalletLink({ address, className, chars = 4 }: { address: string; className?: string; chars?: number }) {
  return (
    <Link href={`/wallet/${address}`} className={cn(linkClass, 'inline-flex items-center gap-2', className)}>
      <SprotoAvatar address={address} className="size-6" />
      {shortAddress(address, chars)}
    </Link>
  )
}

export function ExternalTx({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(linkClass, className)}>
      {children}
    </a>
  )
}
