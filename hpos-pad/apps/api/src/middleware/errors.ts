import type { ErrorRequestHandler, RequestHandler } from 'express'
import type pino from 'pino'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'not found' })
}

export function errorHandler(logger: pino.Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) })
      return
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) })
      return
    }
    if ((err as { type?: string }).type === 'entity.too.large') {
      res.status(413).json({ error: 'payload too large' })
      return
    }
    logger.error({ err: (err as Error).message, stack: (err as Error).stack, url: req.originalUrl }, 'unhandled error')
    res.status(500).json({ error: 'internal error' })
  }
}
