import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A HUD-kit panel: the gunmetal frame with amber trim and light strips
 * (9-sliced from /hud/info.webp) around a black screen, with an optional amber
 * stencil title plate on the top rail. `className` styles the screen,
 * `frameClassName` the frame.
 */
export function Card({
  className,
  frameClassName,
  title,
  vents = false,
  leds,
  keys = false,
  children,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  frameClassName?: string
  /** Amber stencil title plate on the frame's top edge. */
  title?: React.ReactNode
  /** Extra side clearance, for tall panels. */
  vents?: boolean
  /** Light strips on the plate row: 'blue' | 'green' | 'amber' | 'red'. */
  leds?: ('blue' | 'green' | 'amber' | 'red')[]
  /** A row of amber lights on the bottom rail. */
  keys?: boolean
}) {
  return (
    <div
      data-slot="card"
      className={cn('kit-panel', title !== undefined && 'kit-panel-titled', vents && 'kit-panel-vents', frameClassName)}
    >
      {title !== undefined && (
        <div className="kit-panel-head">
          <div className="kit-plate-title">
            <div className="kit-plate-title-text">{title}</div>
          </div>
          {leds && (
            <div className="kit-leds" aria-hidden>
              {leds.map((c, i) => (
                <i key={i} className={`on-${c}`} />
              ))}
            </div>
          )}
        </div>
      )}
      <div className={cn('kit-screen text-card-foreground', className)} {...props}>
        {children}
      </div>
      {keys && (
        <div className="kit-keys" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      )}
    </div>
  )
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-4 pb-2', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('kit-amber font-display text-[13px] font-bold uppercase tracking-[0.14em]', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-4 pt-2', className)} {...props} />
}
