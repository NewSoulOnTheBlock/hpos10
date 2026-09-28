import * as React from 'react'
import { cn } from '@/lib/utils'

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn('kit-field min-h-24 w-full px-3 py-2 font-mono text-base placeholder:font-sans disabled:opacity-50', className)}
      {...props}
    />
  )
}
