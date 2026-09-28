import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ReticleIcon } from '@/components/sc/icons'

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <Card title="Scanner" leds={['amber']} className="flex flex-col items-center gap-4 px-5 py-10 text-center">
        <ReticleIcon className="size-10 text-cyan opacity-80" />
        <p className="font-display text-6xl font-black kit-amber">404</p>
        <p className="font-mono text-sm text-muted-foreground">&gt; this sector of the grid is empty_</p>
        <Button asChild variant="outline">
          <Link href="/">Back to the board</Link>
        </Button>
      </Card>
    </div>
  )
}
