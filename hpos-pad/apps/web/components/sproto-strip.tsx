import { Card } from '@/components/ui/card'

/**
 * The Sproto Gremlins (the HPOS10I NFT collection) on a surveillance monitor:
 * the mosaic pans slowly left and right under scanlines.
 */
export function SprotoStrip() {
  return (
    <Card title="Sproto Gremlins // Brood registry" leds={['blue', 'red']} className="h-28 overflow-hidden sm:h-40">
      <div
        role="img"
        aria-label="Sproto Gremlins, the HPOS10I NFT collection"
        className="sproto-pan absolute inset-y-0 left-0 w-[calc(100%+320px)] bg-[url('/sproto-gremlins.webp')] bg-cover bg-center opacity-90 saturate-[1.1]"
      />
      <span className="pointer-events-none absolute inset-0 bg-[var(--scanlines)]" aria-hidden />
      <span className="pointer-events-none absolute inset-0 shadow-[inset_0_0_40px_rgb(0_0_0/0.85)]" aria-hidden />
      <span className="absolute bottom-2 left-3 rounded-[2px] border border-[#3dff6a]/40 bg-black/85 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.2em] sc-text">
        &gt; sproto gremlins detected_
      </span>
    </Card>
  )
}
