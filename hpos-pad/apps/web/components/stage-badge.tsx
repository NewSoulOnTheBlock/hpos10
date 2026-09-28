import type { TokenStatus } from '@hpos-pad/shared'
import { CocoonIcon, HiveIcon, LarvaIcon } from '@/components/sc/icons'
import { Tooltip } from '@/components/ui/tooltip'
import { stageOf } from '@/lib/evolution'
import { cn } from '@/lib/utils'

const ICON = { larva: LarvaIcon, cocoon: CocoonIcon, mutating: CocoonIcon, hatching: CocoonIcon, hive: HiveIcon } as const

/** The token's evolution stage, derived from its real curve progress. */
export function StageBadge({ status, progress, className }: { status: TokenStatus; progress: number; className?: string }) {
  const s = stageOf(status, progress)
  const Icon = ICON[s.id]
  return (
    <Tooltip content={s.hint}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.12em]',
          s.tone,
          className,
        )}
      >
        <Icon className="size-3.5" />
        {s.name}
      </span>
    </Tooltip>
  )
}
