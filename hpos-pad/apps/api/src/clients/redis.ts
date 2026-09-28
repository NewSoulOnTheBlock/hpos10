import { Redis } from 'ioredis'
import type pino from 'pino'

/** Separate connections: a subscribed ioredis client cannot issue other commands. */
export type RedisClients = { cmd: Redis; sub: Redis }

export function createRedisClients(url: string, logger: pino.Logger): RedisClients {
  const mk = () => {
    const r = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true })
    r.on('error', (err) => logger.warn({ err: err.message }, 'redis error'))
    return r
  }
  return { cmd: mk(), sub: mk() }
}
