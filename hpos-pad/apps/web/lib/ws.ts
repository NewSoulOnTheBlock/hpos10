import type { ChainEvent, WsClientMessage, WsServerMessage } from '@hpos-pad/shared'
import { WS_URL } from './constants'

type Handler = (event: ChainEvent) => void
type StatusListener = (connected: boolean) => void

const PING_MS = 25_000
const MAX_BACKOFF_MS = 30_000

/**
 * One shared socket for the whole app. Components subscribe to topics; the
 * socket is opened on first subscription, resubscribes every live topic after
 * a reconnect, and closes when nothing is listening.
 */
class RealtimeClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private statusListeners = new Set<StatusListener>()
  private attempt = 0
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closeTimer: ReturnType<typeof setTimeout> | null = null
  connected = false

  subscribe(topic: string, handler: Handler): () => void {
    let set = this.handlers.get(topic)
    const isNewTopic = !set
    if (!set) {
      set = new Set()
      this.handlers.set(topic, set)
    }
    set.add(handler)
    if (this.closeTimer) {
      clearTimeout(this.closeTimer)
      this.closeTimer = null
    }
    this.ensureOpen()
    if (isNewTopic) this.send({ op: 'subscribe', topics: [topic] })

    return () => {
      const s = this.handlers.get(topic)
      if (!s) return
      s.delete(handler)
      if (s.size === 0) {
        this.handlers.delete(topic)
        this.send({ op: 'unsubscribe', topics: [topic] })
      }
      if (this.handlers.size === 0) {
        // Grace period so route changes don't thrash the connection.
        this.closeTimer = setTimeout(() => this.close(), 5_000)
      }
    }
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.connected)
    return () => this.statusListeners.delete(listener)
  }

  private setConnected(v: boolean) {
    if (this.connected === v) return
    this.connected = v
    for (const l of this.statusListeners) l(v)
  }

  private ensureOpen() {
    if (typeof window === 'undefined') return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.reconnectTimer) return
    this.open()
  }

  private open() {
    let ws: WebSocket
    try {
      ws = new WebSocket(WS_URL)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.attempt = 0
      this.setConnected(true)
      const topics = [...this.handlers.keys()]
      if (topics.length) this.send({ op: 'subscribe', topics })
      this.pingTimer = setInterval(() => this.send({ op: 'ping' }), PING_MS)
    }

    ws.onmessage = (msg) => {
      let data: WsServerMessage
      try {
        data = JSON.parse(String(msg.data)) as WsServerMessage
      } catch {
        return
      }
      if (data.op !== 'event') return
      const set = this.handlers.get(data.topic)
      if (!set) return
      for (const h of set) {
        try {
          h(data.event)
        } catch (e) {
          console.error('[ws] handler failed', e)
        }
      }
    }

    ws.onclose = () => {
      this.cleanupSocket()
      if (this.handlers.size > 0) this.scheduleReconnect()
    }
    ws.onerror = () => ws.close()
  }

  private cleanupSocket() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.ws = null
    this.setConnected(false)
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    const delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** this.attempt) + Math.random() * 500
    this.attempt++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.handlers.size > 0) this.open()
    }, delay)
  }

  private close() {
    this.closeTimer = null
    if (this.handlers.size > 0) return
    this.ws?.close()
  }

  private send(msg: WsClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }
}

export const realtime = new RealtimeClient()
