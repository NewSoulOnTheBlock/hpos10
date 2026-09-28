import { Redis } from 'ioredis'
import type pino from 'pino'
import { EVENTS_CHANNEL, type ChainEvent } from '@hpos-pad/shared'

export function createRedis(url: string, logger: pino.Logger): Redis {
  const r = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true })
  r.on('error', (err) => logger.warn({ err: err.message }, 'redis error'))
  return r
}

export function publishEvent(redis: Redis, event: ChainEvent): void {
  // Fire-and-forget: a dropped WS event is healed by the next poll on the client.
  redis.publish(EVENTS_CHANNEL, JSON.stringify(event)).catch(() => {})
}
