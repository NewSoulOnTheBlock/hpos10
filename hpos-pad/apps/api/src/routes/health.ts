import { Router } from 'express'
import type { Ctx } from '../context.js'

export function healthRouter(ctx: Ctx): Router {
  const r = Router()
  r.get('/health', async (_req, res) => {
    const [db, redis, hb] = await Promise.all([
      ctx.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      ctx.redis.cmd.ping().then(() => true).catch(() => false),
      ctx.redis.cmd.get('indexer:heartbeat').catch(() => null),
    ])
    const at = hb ? (JSON.parse(hb) as { at: number }).at : null
    const indexerLagSeconds = at ? Math.round((Date.now() - at) / 1000) : null
    res.status(db && redis ? 200 : 503).json({ ok: db && redis, db, redis, indexerLagSeconds })
  })
  return r
}
