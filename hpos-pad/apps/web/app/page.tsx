import { Suspense } from 'react'
import { CreepMap } from '@/components/creep/creep-map'

/** Screen 1: the creep. Fills the viewport under the HUD bar, like a game screen. */
export default function HomePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* useSearchParams (?hatched=) needs a Suspense boundary. */}
      <Suspense fallback={<div className="creep-ground h-dvh" />}>
        <CreepMap />
      </Suspense>
    </div>
  )
}
