import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import type { Ctx } from './context.js'
import { errorHandler, notFound } from './middleware/errors.js'
import { globalLimiter } from './middleware/rate-limit.js'
import { healthRouter } from './routes/health.js'
import { readRouter } from './routes/read.js'
import { rpcRouter } from './routes/rpc.js'
import { claimsRouter } from './routes/claims.js'
import { writeRouter } from './routes/write.js'

/** The express app without listen(), so tests drive it with supertest. */
export function createApp(ctx: Ctx): express.Express {
  const app = express()
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: ctx.env.CORS_ORIGINS === '*' ? '*' : ctx.env.CORS_ORIGINS.split(',').map((s) => s.trim()) }))
  // Launch metadata carries a base64 image (<= 4 MB decoded).
  app.use(express.json({ limit: '6mb' }))
  app.use(globalLimiter)
  app.use((req, res, next) => {
    const started = Date.now()
    res.on('finish', () => ctx.logger.debug({ method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - started }, 'request'))
    next()
  })

  app.use(healthRouter(ctx))
  app.use(readRouter(ctx))
  app.use(writeRouter(ctx))
  app.use(rpcRouter(ctx))
  app.use(claimsRouter(ctx))
  app.use(notFound)
  app.use(errorHandler(ctx.logger))
  return app
}
