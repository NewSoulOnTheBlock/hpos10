'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'

/**
 * `inLink`: the button sits inside a clickable card link; copying must not
 * also open the token page.
 */
export function CopyButton({
  value,
  label,
  className,
  inLink = false,
  toastText,
}: {
  value: string
  label?: string
  className?: string
  inLink?: boolean
  toastText?: string
}) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[2px] px-1.5 py-1 text-muted-foreground transition-colors outline-none hover:text-[#f0a818] focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onClick={async (e) => {
        if (inLink) {
          e.preventDefault()
          e.stopPropagation()
        }
        try {
          await copyText(value)
          if (toastText) toast.success(toastText)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {
          toast.error('Could not copy. Select and copy manually.')
        }
      }}
      aria-label={`Copy ${label ?? value}`}
    >
      {label && <span className="font-mono text-sm">{label}</span>}
      {done ? <Check className="size-3.5 text-phosphor-bright drop-shadow-[0_0_4px_var(--phosphor)]" /> : <Copy className="size-3.5" />}
    </button>
  )
}
