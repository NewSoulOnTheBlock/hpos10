import type { Server } from 'node:http'
import { EVENTS_CHANNEL, type ChainEvent, type WsClientMessage, type WsServerMessage, topicsFor } from '@hpos-pad/shared'
import type { Redis } from 'ioredis'
import type pino from 'pino'
import { WebSocket, WebSocketServer } from 'ws'

const MAX_TOPICS = 50
const TOPIC = /^(trades|tokens|token:[1-9A-HJ-NP-Za-km-z]{32,44})$/

/**
 * Fans the indexer's Redis events out to browser sockets by topic. Stateless
 * per replica: every api instance subscribes to the same channel, so any
 * number of replicas can sit behind a load balancer.
 */
export function attachWsBridge(server: Server, sub: Redis, logger: pino.Logger): () => Promise<void> {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 })
  const topics = new WeakMap<WebSocket, Set<string>>()
  const alive = new WeakMap<WebSocket, boolean>()

  const send = (ws: WebSocket, msg: WsServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  wss.on('connection', (ws) => {
    topics.set(ws, new Set())
    alive.set(ws, true)
    ws.on('pong', () => alive.set(ws, true))
    ws.on('message', (data) => {
      let msg: WsClientMessage
      try {
        msg = JSON.parse(data.toString()) as WsClientMessage
      } catch {
        return send(ws, { op: 'error', message: 'invalid json' })
      }
      alive.set(ws, true)
      const set = topics.get(ws)!
      if (msg.op === 'ping') return send(ws, { op: 'pong' })
      if (msg.op === 'subscribe' || msg.op === 'unsubscribe') {
        for (const t of Array.isArray(msg.topics) ? msg.topics : []) {
          if (typeof t !== 'string' || !TOPIC.test(t)) continue
          if (msg.op === 'subscribe' && set.size < MAX_TOPICS) set.add(t)
          if (msg.op === 'unsubscribe') set.delete(t)
        }
      }
    })
  })

  // Drop sockets that stopped answering pings (half-open connections).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate()
        continue
      }
      alive.set(ws, false)
      ws.ping()
    }
  }, 30_000)

  void sub.subscribe(EVENTS_CHANNEL)
  sub.on('message', (_channel, payload) => {
    let event: ChainEvent
    try {
      event = JSON.parse(payload) as ChainEvent
    } catch {
      return
    }
    const eventTopics = topicsFor(event)
    for (const ws of wss.clients) {
      const set = topics.get(ws)
      if (!set) continue
      const hit = eventTopics.find((t) => set.has(t))
      if (hit) send(ws, { op: 'event', topic: hit, event })
    }
  })
  logger.info('websocket bridge on /ws')

  return async () => {
    clearInterval(heartbeat)
    for (const ws of wss.clients) ws.terminate()
    await new Promise<void>((r) => wss.close(() => r()))
  }
}
