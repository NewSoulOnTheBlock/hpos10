import { HPOSPAD_X_HANDLE, HPOSPAD_X_URL } from '@/lib/constants'
import { cn } from '@/lib/utils'

/** The X logo (lucide has no brand marks). */
export function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-4 fill-current', className)}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

/** Link to The Hatchery on X. `label` shows the handle next to the logo. */
export function XLink({ label = false, className }: { label?: boolean; className?: string }) {
  return (
    <a
      href={HPOSPAD_X_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`The Hatchery on X (${HPOSPAD_X_HANDLE})`}
      className={cn('inline-flex items-center gap-1.5 rounded-[2px] text-muted-foreground transition-colors outline-none hover:text-[#f0a818] focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      <XLogo />
      {label && <span className="font-mono text-sm">{HPOSPAD_X_HANDLE}</span>}
    </a>
  )
}

/** The Telegram paper plane. */
export function TelegramLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-4 fill-current', className)}>
      <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.9c.9-.3 1.7.2 1.4 1.4z" />
    </svg>
  )
}
