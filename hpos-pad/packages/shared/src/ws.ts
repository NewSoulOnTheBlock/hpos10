import type { TokenDTO, TradeDTO } from './dto.js'

/** Redis pub/sub channel the chain indexer publishes to and the api fans out. */
export const EVENTS_CHANNEL = 'hpospad:events'

export type ChainEvent =
  | { type: 'trade'; trade: TradeDTO; token: Pick<TokenDTO, 'mint' | 'symbol' | 'imageUrl' | 'priceQuote' | 'marketCapQuote' | 'progress' | 'status'> }
  | { type: 'token:new'; token: TokenDTO }
  | { type: 'token:update'; token: TokenDTO }
  | { type: 'reflection'; mint: string; epochId: string; distributedQuote: string; recipients: number }

/** Client -> server. Topics: "trades" (all), "token:<mint>", "tokens". */
export type WsClientMessage =
  | { op: 'subscribe'; topics: string[] }
  | { op: 'unsubscribe'; topics: string[] }
  | { op: 'ping' }

/** Server -> client. */
export type WsServerMessage =
  | { op: 'event'; topic: string; event: ChainEvent }
  | { op: 'pong' }
  | { op: 'error'; message: string }

export function topicsFor(event: ChainEvent): string[] {
  switch (event.type) {
    case 'trade':
      return ['trades', `token:${event.trade.mint}`]
    case 'token:new':
      return ['tokens']
    case 'token:update':
      return ['tokens', `token:${event.token.mint}`]
    case 'reflection':
      return [`token:${event.mint}`]
  }
}
