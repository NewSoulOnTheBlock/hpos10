'use client'

import Link from 'next/link'
import { LarvaSprite } from '@/components/creep/sprites'
import { LARVA_SLOTS, useLarvae } from '@/lib/larva'
import { cn } from '@/lib/utils'

/** The three larva slots (drafts). Filled larvae have a draft saved in this browser. */
export function LarvaPicker({ active }: { active?: number }) {
  const larvae = useLarvae()
  return (
    <div className="kit-well flex gap-1 p-1" role="group" aria-label="Larva slots">
      {Array.from({ length: LARVA_SLOTS }, (_, i) => {
        const d = larvae[i]
        return (
          <Link
            key={i}
            href={`/create?larva=${i}`}
            aria-current={active === i ? 'true' : undefined}
            aria-label={`Larva ${i + 1}${d?.symbol ? `: $${d.symbol}` : ' (empty)'}`}
            className={cn(
              'kit-toggle w-20 flex-col px-1 pt-1 pb-1.5 font-mono text-[10px] font-normal tracking-normal',
            )}
          >
            <LarvaSprite wire={!d} className="h-10 w-14" />
            <span className="max-w-full truncate">{d?.symbol ? `$${d.symbol}` : `larva ${i + 1}`}</span>
          </Link>
        )
      })}
    </div>
  )
}
