import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { MorphScreen } from '@/components/creep/morph-screen'

export const metadata: Metadata = { title: 'Morph a token' }

export default function CreatePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-2 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/" className="w-fit font-mono text-sm text-muted-foreground hover:text-[#f0a818]">
            &lt; back to the creep
          </Link>
          <h1 className="kit-title text-2xl sm:text-3xl">
            The Hatchery <span className="text-[#ffd98a]">{'// select larva to morph'}</span>
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            You never create a coin: you morph a larva. One transaction grows it into a token on a Meteora bonding curve;
            it curls into an egg as the curve fills, and hatches on a DAMM v2 pool with liquidity locked forever.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="kit-panel h-96 animate-pulse" />}>
        <MorphScreen />
      </Suspense>
    </div>
  )
}
