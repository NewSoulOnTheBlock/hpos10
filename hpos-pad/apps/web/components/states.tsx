import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { LarvaIcon } from '@/components/sc/icons'
import { cn } from '@/lib/utils'

export function EmptyState({ title, body, action, className }: { title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('kit-well flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center', className)}>
      <LarvaIcon className="wriggle size-9 opacity-80" />
      <p className="font-display text-sm font-bold uppercase tracking-[0.16em] kit-amber">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <div className={cn('kit-well flex flex-col items-center gap-3 border-destructive/50 px-6 py-10 text-center', className)}>
      <AlertTriangle className="size-6 text-destructive" />
      <p className="font-mono text-sm text-muted-foreground">&gt; {message}</p>
      {onRetry && (
        <button onClick={onRetry} className="font-display text-[11px] font-bold uppercase tracking-[0.16em] kit-amber hover:underline">
          Retry
        </button>
      )}
    </div>
  )
}
