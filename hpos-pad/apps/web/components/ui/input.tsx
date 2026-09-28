import * as React from 'react'
import { cn } from '@/lib/utils'

/** A black readout slot with a thin gunmetal rim; the value reads in green mono. */
export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'kit-field h-10 w-full min-w-0 px-3 font-mono text-base placeholder:font-sans disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
