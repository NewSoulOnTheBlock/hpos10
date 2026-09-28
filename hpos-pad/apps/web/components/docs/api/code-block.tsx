import { CopyButton } from '@/components/copy-button'
import { cn } from '@/lib/utils'

/** A terminal readout in a recessed well. Scrolls sideways inside itself, never the page. */
export function CodeBlock({ code, lang, title, className }: { code: string; lang?: string; title?: string; className?: string }) {
  return (
    <figure className={cn('kit-well min-w-0 overflow-hidden', className)}>
      <figcaption className="flex items-center justify-between gap-2 border-b border-[#2c2925] bg-steel-dark/70 px-3 py-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="led on-green shrink-0" aria-hidden />
          <span className="truncate font-display text-[10px] font-bold uppercase tracking-[0.16em] kit-stencil">
            {title ?? lang ?? 'readout'}
          </span>
        </span>
        <CopyButton value={code} label="copy" className="-mr-1.5 [&_span]:text-[11px]" />
      </figcaption>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-[1.5] text-phosphor-bright/90 [text-shadow:0_0_6px_rgb(61_255_106/0.35)]">
        <code>{code}</code>
      </pre>
    </figure>
  )
}

/** Inline code. */
export function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded-[2px] border border-[#2c2925] bg-black px-1 font-mono text-[0.85em] text-phosphor-bright/90 break-words">{children}</code>
}
