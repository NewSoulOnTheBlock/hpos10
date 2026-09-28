import * as React from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

/** value: 0..1. A segmented green gauge in a black slot, like a build-progress bar. At least one segment always shows. */
export function Progress({
  className,
  value,
  ...props
}: Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, 'value'> & { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <ProgressPrimitive.Root
      value={pct}
      className={cn('kit-well relative h-2 w-full overflow-hidden rounded-[1px]', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-[repeating-linear-gradient(90deg,#7dff6a_0_6px,#2fbf3a_6px_7px,transparent_7px_8px)] shadow-[0_0_10px_rgb(61_255_106/0.55)] transition-[width] duration-500"
        style={{ width: `max(${pct}%, 7px)` }}
      />
    </ProgressPrimitive.Root>
  )
}
