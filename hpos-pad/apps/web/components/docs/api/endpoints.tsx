import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type Endpoint = {
  method: 'GET' | 'POST' | 'WS'
  path: string
  /** Query / body summary. */
  params?: React.ReactNode
  returns: React.ReactNode
  notes?: React.ReactNode
}

const METHOD_CLS: Record<Endpoint['method'], string> = {
  GET: 'border-phosphor/60 bg-phosphor/10 sc-text',
  POST: 'border-cyan/60 bg-cyan/10 kit-amber',
  WS: 'border-sonic/60 bg-sonic/10 kit-cyan',
}

/** Compact endpoint list: stacked on phones, a three-column grid from md up. */
export function EndpointList({ items }: { items: Endpoint[] }) {
  return (
    <div className="kit-well overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-3 border-b border-[#2c2925] bg-steel-dark/70 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] kit-stencil md:grid">
        <span>Endpoint</span>
        <span>Params</span>
        <span>Returns</span>
      </div>
      <ul className="divide-y divide-[#2c2925]">
        {items.map((e) => (
          <li
            key={`${e.method} ${e.path}`}
            className="grid gap-x-3 gap-y-1 px-3 py-2 text-sm leading-snug md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)]"
          >
            <div className="flex min-w-0 items-start gap-2">
              <span
                className={cn(
                  'mt-px w-10 shrink-0 rounded-[2px] border px-1 text-center font-mono text-[10px] font-bold leading-4',
                  METHOD_CLS[e.method],
                )}
              >
                {e.method}
              </span>
              <code className="min-w-0 font-mono text-[12.5px] break-all text-phosphor-bright">{e.path}</code>
            </div>
            <div className="min-w-0 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
              <span className="font-semibold text-foreground/70 md:hidden">Params: </span>
              {e.params ?? <span className="opacity-60">none</span>}
            </div>
            <div className="min-w-0 text-[13px] [overflow-wrap:anywhere]">
              <span className="font-semibold text-muted-foreground md:hidden">Returns: </span>
              {e.returns}
            </div>
            {e.notes && (
              <p className="text-[13px] text-muted-foreground md:col-span-3 [overflow-wrap:anywhere]">{e.notes}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One section of the API manual: a console with the section name on its title plate. */
export function DocSection({
  id,
  title,
  leds = ['green'],
  children,
}: {
  id: string
  title: string
  leds?: ('blue' | 'green' | 'amber' | 'red')[]
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card
        title={
          <h2 className="whitespace-nowrap">
            <a href={`#${id}`} className="hover:text-[#f0a818]">
              {title}
            </a>
          </h2>
        }
        leds={leds}
        className="flex flex-col gap-3 p-4 text-[15px] leading-normal text-muted-foreground sm:p-5"
      >
        {children}
      </Card>
    </section>
  )
}

export function SubHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mt-2 scroll-mt-20 font-display text-xs font-bold uppercase tracking-[0.16em] kit-amber">
      {children}
    </h3>
  )
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[3px] border-l-2 px-3 py-2 text-sm leading-snug',
        tone === 'warn' ? 'border-amber bg-amber/8 text-foreground/90' : 'border-[#3dff6a]/70 bg-[#3dff6a]/5 text-foreground/90',
      )}
    >
      {children}
    </div>
  )
}
