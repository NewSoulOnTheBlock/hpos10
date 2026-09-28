import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** Readout chips: a black slot with a thin lit rim around glowing uppercase text. */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-[3px] border bg-black px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap shadow-[0_0_0_1px_#000]',
  {
    variants: {
      variant: {
        default: 'border-[#3dff6a]/55 sc-text',
        muted: 'border-border text-muted-foreground',
        success: 'border-[#3dff6a]/55 sc-text',
        warning: 'border-[#f0a818]/65 kit-amber',
        sonic: 'border-[#feeb00]/55 kit-cyan',
        cyan: 'border-[#f0a818]/65 kit-amber',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
