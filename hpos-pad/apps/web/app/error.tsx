'use client'

import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <Card title="System fault" leds={['red', 'amber']} className="flex flex-col items-center gap-4 px-5 py-10 text-center">
        <p className="font-display text-2xl font-black uppercase tracking-wide text-destructive">
          Something broke
        </p>
        <p className="kit-well w-full break-words px-3 py-2 text-left font-mono text-sm text-muted-foreground">
          &gt; {error.message || 'unexpected error'}
          {error.digest && <span className="block text-xs opacity-70">&gt; digest {error.digest}</span>}
        </p>
        <Button variant="outline" onClick={reset}>
          <RotateCcw /> Try again
        </Button>
      </Card>
    </div>
  )
}
