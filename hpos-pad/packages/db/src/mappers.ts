import type { ReflectionEpoch, ReflectionPayout, Token, Trade } from '@prisma/client'
import { soldBps, toUi, type ReflectionEpochDTO, type ReflectionPayoutDTO, type TokenDTO, type TradeDTO } from '@hpos-pad/shared'

/** Decimal(40,0) columns come back as Prisma.Decimal; this keeps them integral. */
const raw = (d: { toFixed: (dp?: number) => string }): bigint => BigInt(d.toFixed(0))

export type Decimals = { base: number; quote: number }

export function toTokenDTO(t: Token, dec: Decimals, quoteUsd: number | null): TokenDTO {
  const threshold = raw(t.migrationThreshold)
  const reserve = raw(t.quoteReserve)
  const progress =
    t.status !== 'CURVE' ? 1 : threshold > 0n ? Math.min(1, Number((reserve * 10_000n) / threshold) / 10_000) : 0
  return {
    mint: t.mint,
    pool: t.pool,
    dammPool: t.dammPool,
    creator: t.creator,
    name: t.name,
    symbol: t.symbol,
    description: t.description,
    imageUrl: t.imageUrl,
    website: t.website,
    twitter: t.twitter,
    telegram: t.telegram,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    migratedAt: t.migratedAt?.toISOString() ?? null,
    priceQuote: t.priceQuote,
    priceUsd: quoteUsd == null ? null : t.priceQuote * quoteUsd,
    marketCapQuote: t.marketCapQuote,
    marketCapUsd: quoteUsd == null ? null : t.marketCapQuote * quoteUsd,
    progress,
    quoteReserve: toUi(reserve, dec.quote),
    volume24hQuote: toUi(raw(t.volume24hQuote), dec.quote),
    trades24h: t.trades24h,
    priceChange24h: t.priceChange24h,
    holders: t.holders,
    lastTradeAt: t.lastTradeAt?.toISOString() ?? null,
    feesTotalQuote: toUi(raw(t.feesTotalQuote), dec.quote),
    reflectedTotalQuote: toUi(raw(t.reflectedTotalQuote), dec.quote),
    pendingReflectionQuote: toUi(raw(t.carryQuote), dec.quote),
    creatorEarnedQuote: toUi(raw(t.creatorEarnedQuote), dec.quote),
    lifeState: t.lifeState,
    creatorSold: soldBps(raw(t.creatorBoughtBase), raw(t.creatorSoldBase)) / 10_000,
    athMarketCapQuote: t.athMarketCapQuote,
  }
}

export function toTradeDTO(
  t: Trade,
  token: { symbol: string; imageUrl: string | null },
  dec: Decimals,
  quoteUsd: number | null,
): TradeDTO {
  return {
    signature: t.signature,
    mint: t.mint,
    symbol: token.symbol,
    imageUrl: token.imageUrl,
    trader: t.trader,
    side: t.side,
    baseAmount: toUi(raw(t.baseAmount), dec.base),
    quoteAmount: toUi(raw(t.quoteAmount), dec.quote),
    feeQuote: toUi(raw(t.feeQuote), dec.quote),
    priceQuote: t.priceQuote,
    priceUsd: quoteUsd == null ? null : t.priceQuote * quoteUsd,
    venue: t.venue,
    blockTime: t.blockTime.toISOString(),
    slot: Number(t.slot),
  }
}

export function toEpochDTO(e: ReflectionEpoch, quoteDecimals: number): ReflectionEpochDTO {
  return {
    id: e.id,
    mint: e.mint,
    createdAt: e.createdAt.toISOString(),
    status: e.status,
    claimedQuote: toUi(raw(e.claimedQuote), quoteDecimals),
    holdersQuote: toUi(raw(e.holdersQuote), quoteDecimals),
    creatorQuote: toUi(raw(e.creatorQuote), quoteDecimals),
    platformQuote: toUi(raw(e.platformQuote), quoteDecimals),
    distributedQuote: toUi(raw(e.distributedQuote), quoteDecimals),
    carriedQuote: toUi(raw(e.carriedQuote), quoteDecimals),
    recipients: e.recipients,
    claimSignatures: e.claimSignatures,
  }
}

export function toPayoutDTO(p: ReflectionPayout, symbol: string, quoteDecimals: number): ReflectionPayoutDTO {
  return {
    epochId: p.epochId,
    mint: p.mint,
    symbol,
    owner: p.owner,
    amountQuote: toUi(raw(p.amount), quoteDecimals),
    signature: p.signature,
    createdAt: p.createdAt.toISOString(),
  }
}
