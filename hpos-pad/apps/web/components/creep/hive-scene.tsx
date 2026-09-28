import { AnimatedSprite, DroneSprite, LarvaSprite } from '@/components/creep/sprites'
import { cn } from '@/lib/utils'

/**
 * A small still of the creep for the swarm page's banner: the Hive with a
 * Hatchery and a Lair either side, larvae and a drone at its feet, on the
 * map texture. Built from the same animated sprites as the creep.
 */
export function HiveScene({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative aspect-[16/10] w-full overflow-hidden rounded-[3px] bg-[url(/maps/melancholy-tile.webp)] bg-[length:900px] bg-center', className)}
      role="img"
      aria-label="The Hatchery: a Hive flanked by a Hatchery and a Lair, larvae at its feet"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_55%,transparent_40%,rgb(0_0_0/0.75)_100%)]" aria-hidden />
      <span className="creep-blot absolute left-[8%] right-[8%] top-[48%] h-[46%]" aria-hidden />
      <AnimatedSprite name="hatchery" className="absolute bottom-[24%] left-[4%] w-[30%] drop-shadow-[0_8px_10px_rgb(0_0_0/0.7)]" />
      <AnimatedSprite name="lair" className="absolute bottom-[22%] right-[3%] w-[32%] drop-shadow-[0_8px_10px_rgb(0_0_0/0.7)]" />
      <AnimatedSprite name="hive" className="absolute bottom-[14%] left-1/2 w-[40%] -translate-x-1/2 drop-shadow-[0_10px_12px_rgb(0_0_0/0.75)]" />
      <div className="absolute bottom-[4%] left-1/2 flex -translate-x-1/2 gap-3">
        <LarvaSprite className="w-12" />
        <LarvaSprite className="w-12 [&_.zsprite]:[animation-delay:-0.3s]" />
        <LarvaSprite className="w-12 [&_.zsprite]:[animation-delay:-0.6s]" />
      </div>
      <DroneSprite className="absolute bottom-[10%] left-[22%] w-10" />
      <DroneSprite className="absolute bottom-[8%] right-[24%] w-10 -scale-x-100" />
    </div>
  )
}
