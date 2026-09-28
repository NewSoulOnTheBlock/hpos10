import * as React from 'react'
import { Label as LabelPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('kit-amber font-display text-[11px] font-bold uppercase tracking-[0.16em]', className)}
      {...props}
    />
  )
}
