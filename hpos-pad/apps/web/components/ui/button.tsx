import * as React from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * HUD-kit command plates (9-sliced /hud/btn-*.webp, see .kit-button in kit.css).
 * `default` is the lit orange plate (the primary command), `outline`/`subtle`
 * the dark plate with an orange rim and amber legend, `success`/`destructive`
 * the same plate tinted green/red, `ghost` a bare amber legend.
 */
const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-display text-xs font-bold uppercase tracking-[0.12em] transition-[filter,transform,color] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'kit-button',
        outline: 'kit-button kit-button-dark',
        ghost: 'rounded-[3px] text-muted-foreground hover:bg-accent/60 hover:text-[#f0a818]',
        subtle: 'kit-button kit-button-dark',
        destructive: 'kit-button kit-button-red',
        success: 'kit-button kit-button-green',
      },
      size: {
        default: 'h-10 px-5',
        sm: 'h-8 px-3 text-[11px]',
        lg: 'h-12 px-7 text-[14px]',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { buttonVariants }
