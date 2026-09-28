import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { Ctx } from '../context.js'

/**
 * Browser JSON-RPC proxy: the web app talks to /rpc, the api forwards to the
 * private RPC_URL. The provider key never reaches the browser, and public
 * RPC nodes (which reject browser sendTransaction with 403) are avoided.
 * Only the methods the site and wallet adapter need are allowed.
 */
const ALLOWED = new Set([
  'getAccountInfo',
  'getBalance',
  'getBlockHeight',
  'getEpochInfo',
  'getFeeForMessage',
  'getGenesisHash',
  'getLatestBlockhash',
  'getMinimumBalanceForRentExemption',
  'getMultipleAccounts',
  'getRecentPrioritizationFees',
  'getSignatureStatuses',
  'getSlot',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getVersion',
  'isBlockhashValid',
  'sendTransaction',
  'simulateTransaction',
])
const MAX_BATCH = 20

type RpcReq = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown }

const rpcLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false })

export function rpcRouter(ctx: Ctx): Router {
  const r = Router()
  r.post('/rpc', rpcLimiter, async (req, res) => {
    const body = req.body as RpcReq | RpcReq[]
    const calls = Array.isArray(body) ? body : [body]
    if (calls.length === 0 || calls.length > MAX_BATCH) {
      res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `batch of 1..${MAX_BATCH} calls` } })
      return
    }
    const denied = calls.find((c) => typeof c?.method !== 'string' || !ALLOWED.has(c.method))
    if (denied) {
      res.status(403).json({ jsonrpc: '2.0', id: denied?.id ?? null, error: { code: -32601, message: `method not allowed: ${String(denied?.method)}` } })
      return
    }
    const upstream = await fetch(ctx.env.RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    res.status(upstream.status).type('application/json').send(await upstream.text())
  })
  return r
}
