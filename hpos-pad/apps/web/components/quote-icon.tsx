import { cn } from '@/lib/utils'

/**
 * The HPOS10I mark, used wherever an amount or reward is paid in the quote
 * token. Shipped locally (public/hpos10i.webp): the quote is fixed per DBC
 * config, so there is nothing to look up at runtime.
 */
export function QuoteIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/hpos10i.webp"
      alt=""
      aria-hidden
      width={16}
      height={16}
      className={cn('inline-block size-4 shrink-0 rounded-full bg-white object-contain p-px', className)}
    />
  )
}
