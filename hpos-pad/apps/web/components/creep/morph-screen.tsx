'use client'

import { useSearchParams } from 'next/navigation'
import { CreateTokenForm } from '@/components/create/create-token-form'
import { LarvaPicker } from '@/components/creep/larva-picker'
import { LARVA_SLOTS } from '@/lib/larva'

/** Screen 2: pick a larva (?larva=0..2) and morph it. */
export function MorphScreen() {
  const n = Number(useSearchParams().get('larva'))
  const larva = Number.isInteger(n) && n >= 0 && n < LARVA_SLOTS ? n : 0
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="sc-text font-mono text-sm">
          &gt; larva {larva + 1}/{LARVA_SLOTS} selected. drafts are kept in this browser_
        </p>
        <LarvaPicker active={larva} />
      </div>
      {/* Keyed by slot so switching larva reloads that draft. */}
      <CreateTokenForm key={larva} larva={larva} />
    </>
  )
}
