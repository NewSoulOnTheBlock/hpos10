import { rateLimit } from 'express-rate-limit'

export const globalLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false })
/** Building transactions hits the RPC and Jupiter; keep it bounded per IP. */
export const txLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false })
/** IPFS pinning costs money and storage. */
export const uploadLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false })
