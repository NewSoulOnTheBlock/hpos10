export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3_600,
  '4h': 14_400,
  '1d': 86_400,
}

/** Lifecycle of a launched token. */
export const TOKEN_STATUSES = ['CURVE', 'COMPLETE', 'MIGRATED'] as const
export type TokenStatus = (typeof TOKEN_STATUSES)[number]

export const TOKEN_SORTS = ['new', 'volume', 'mcap', 'progress', 'lastTrade'] as const
export type TokenSort = (typeof TOKEN_SORTS)[number]

export const TOKEN_DECIMALS = 6
export const TOKEN_TOTAL_SUPPLY = 1_000_000_000
