import type { Timeframe, TokenStatus } from './constants.js'

/**
 * Wire types shared by the api and the web app. Amounts are decimal strings
 * in UI units (never floats) so nothing loses precision in transit; prices
 * and market caps are plain numbers because they are display-only.
 */

export type LaunchpadConfigDTO = {
  cluster: 'mainnet-beta' | 'devnet'
  dbcConfig: string
  quote: { mint: string; symbol: string; decimals: number; name: string; logoUrl: string | null }
  fees: {
    tradeFeeBps: number
    protocolBps: number
    reflectionBps: number
    /** Paid to the wallet that launched each token. */
    creatorBps: number
    platformBps: number
  }
  curve: {
    /** Quote raised when the curve completes, in quote UI units (like every amount). */
    migrationQuoteThreshold: string
  }
  token: { decimals: number; totalSupply: number }
  treasury: string
  feeClaimer: string
  /** Tokens the pad features (the mascot first). Shown pinned with a badge. */
  featuredMints: string[]
  /** The platform's own official token, pinned next to the mascot. */
  officialMint: string | null
}

export type TokenDTO = {
  mint: string
  pool: string
  dammPool: string | null
  creator: string
  name: string
  symbol: string
  description: string | null
  imageUrl: string | null
  website: string | null
  twitter: string | null
  telegram: string | null
  status: TokenStatus
  createdAt: string
  migratedAt: string | null
  priceQuote: number
  priceUsd: number | null
  marketCapQuote: number
  marketCapUsd: number | null
  /** 0..1 progress to the migration threshold. 1 once complete. */
  progress: number
  quoteReserve: string
  volume24hQuote: string
  trades24h: number
  priceChange24h: number | null
  holders: number
  lastTradeAt: string | null
  /** All fees traders have paid on this token. */
  feesTotalQuote: string
  /** Paid out to holders so far. */
  reflectedTotalQuote: string
  /** Owed to holders, waiting for the next payout (shares too small to send yet). */
  pendingReflectionQuote: string
  /** Creator share paid to `creator` so far. */
  creatorEarnedQuote: string
  /** ALIVE, DEAD (quiet for a day) or RUGGED (see vitals.ts). */
  lifeState: 'ALIVE' | 'DEAD' | 'RUGGED'
  /** Share of the creator's bought tokens they have sold, 0..1. */
  creatorSold: number
  athMarketCapQuote: number
}

export type TokenListResponse = { items: TokenDTO[]; nextCursor: string | null }

export type TradeDTO = {
  signature: string
  mint: string
  /** Denormalised so feeds (ticker, wallet history) can render without a token lookup. */
  symbol: string
  imageUrl: string | null
  trader: string
  side: 'BUY' | 'SELL'
  baseAmount: string
  quoteAmount: string
  feeQuote: string
  priceQuote: number
  priceUsd: number | null
  venue: 'DBC' | 'DAMM_V2'
  blockTime: string
  slot: number
}

export type CandleDTO = {
  /** Bucket start, unix seconds. */
  time: number
  open: number
  high: number
  low: number
  close: number
  volumeQuote: number
}

export type CandleListResponse = { timeframe: Timeframe; items: CandleDTO[] }

export type HolderDTO = { owner: string; amount: string; share: number; label: string | null }

export type ReflectionEpochDTO = {
  id: string
  mint: string
  createdAt: string
  status: 'CLAIMED' | 'DISTRIBUTING' | 'DONE' | 'FAILED'
  claimedQuote: string
  holdersQuote: string
  creatorQuote: string
  platformQuote: string
  distributedQuote: string
  carriedQuote: string
  recipients: number
  claimSignatures: string[]
}

export type ReflectionPayoutDTO = {
  epochId: string
  mint: string
  symbol: string
  owner: string
  amountQuote: string
  signature: string | null
  createdAt: string
}

export type WalletReflectionsResponse = Paginated<ReflectionPayoutDTO> & { totalQuote: string }

/** Reflections a wallet has received, per token. */
export type TokenEarningsDTO = {
  mint: string
  symbol: string
  name: string
  imageUrl: string | null
  totalQuote: string
  payouts: number
  lastPaidAt: string | null
}
/** Creator share a wallet earned from tokens it launched. */
export type CreatorEarningsDTO = { mint: string; symbol: string; name: string; imageUrl: string | null; totalQuote: string }

export type WalletEarningsResponse = {
  /** Reflections received as a holder. */
  totalQuote: string
  tokens: TokenEarningsDTO[]
  /** Creator share received for tokens this wallet launched. */
  creatorTotalQuote: string
  created: CreatorEarningsDTO[]
}

export type PlatformStatsDTO = {
  tokens: number
  graduated: number
  volume24hQuote: string
  reflectedTotalQuote: string
  /** Creator share paid out across every token. */
  creatorEarnedTotalQuote: string
  quoteUsd: number | null
}

export type Paginated<T> = { items: T[]; nextCursor: string | null }

/* --------------------------- launch + trade -------------------------- */

export type MetadataUploadRequest = {
  name: string
  symbol: string
  description?: string
  website?: string
  twitter?: string
  telegram?: string
  /** data: URL (png/jpeg/gif/webp), <= 4 MB decoded. */
  image: string
}
export type MetadataUploadResponse = { uri: string; imageUrl: string }

export type PayWith = 'SOL' | 'QUOTE'

export type LaunchBuildRequest = {
  creator: string
  /** Omit to get a vanity mint from the pad's pool; the server then signs for it. */
  mint?: string
  name: string
  symbol: string
  uri: string
  description?: string
  website?: string
  twitter?: string
  telegram?: string
  imageUrl?: string
  /** Optional dev buy in the same transaction, UI units of `payWith`. */
  firstBuy?: { amount: string; payWith: PayWith; slippageBps: number }
}

export type TradeQuoteRequest = {
  mint: string
  side: 'BUY' | 'SELL'
  /** UI units of the input: payWith asset for buys, the token for sells. */
  amount: string
  payWith: PayWith
  slippageBps: number
}

export type TradeQuote = {
  inAmount: string
  outAmount: string
  minOut: string
  feeQuote: string
  priceImpactPct: number | null
  route: string
}

export type TradeBuildRequest = TradeQuoteRequest & { owner: string }

export type BuiltTransaction = {
  /**
   * Transactions to sign together with `transaction` and send FIRST, in
   * order, each confirmed before the next. Used when a SOL leg cannot fit in
   * the same transaction (e.g. launch + first buy paid in SOL): the swap to
   * the quote token lands first, then the atomic create + first buy.
   */
  preTransactions?: string[]
  /** base64 serialized VersionedTransaction (unsigned, or partially signed by the server for a vanity mint). */
  transaction: string
  /** Launches: the mint the transaction creates. */
  mint?: string
  /** Launches: true when the server already signed for the mint; the client signs with its wallet only. */
  mintSigned?: boolean
  lastValidBlockHeight: number
  quote: TradeQuote | null
}

/* ------------------------------- claims ------------------------------- */

/** Reflections accrue per wallet across every token; one claim withdraws them all. */
export type ClaimableDTO = {
  claimableQuote: string
  accruedQuote: string
  claimedQuote: string
  /** A claim waiting to land (its amount is reserved). */
  pending: { id: string; amountQuote: string } | null
  minClaimQuote: string
}

export type ClaimBuildResponse = {
  claimId: string
  /** base64 v0 transaction, already signed by the vault; the claimant signs as fee payer. */
  transaction: string
  lastValidBlockHeight: number
  amountQuote: string
}
