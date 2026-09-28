/**
 * The launchpad fee model.
 *
 * Every trade on a The Hatchery curve pays one DBC trading fee, taken in the quote
 * token (collectFeeMode = QuoteToken). Meteora's program keeps a fixed 20% of
 * it as the protocol fee. The rest -- the "partner" side, since the config's
 * creatorTradingFeePercentage is 0 -- is claimed by the platform fee claimer
 * and split in software between holders and the platform treasury.
 *
 * At the defaults (TRADE_FEE_BPS = 160, REFLECTION_BPS = 0, CREATOR_BPS = 75):
 *
 *   trader pays        1.60%
 *   Meteora protocol   0.32%   (20% of the fee, fixed by the program)
 *   creator            0.75%   (the wallet that launched the token)
 *   platform           0.53%
 *   holders            0      (reflections off; set REFLECTION_BPS to turn them on)
 *
 * After graduation the DAMM v2 pool charges the same fee (migratedPoolFee),
 * DAMM's own protocol keeps 20%, and the platform's permanently locked LP
 * position earns the rest, so the split is identical before and after.
 */

/** Meteora's cut of the DBC trading fee. Fixed by the program. */
export const METEORA_PROTOCOL_FEE_PCT = 20

export type FeeModel = {
  /** Total fee the trader pays, in bps of the quote side of the trade. */
  tradeFeeBps: number
  /** Share of volume reflected to holders, in bps. */
  reflectionBps: number
  /** Share of volume paid to the wallet that launched the token, in bps. */
  creatorBps?: number
}

export type FeeSplit = {
  tradeFeeBps: number
  protocolBps: number
  reflectionBps: number
  creatorBps: number
  platformBps: number
  /** What the platform can claim per trade (trade fee minus Meteora's cut), in bps of volume. */
  claimableBps: number
}

export function feeSplit(model: FeeModel): FeeSplit {
  const creatorBps = model.creatorBps ?? 0
  const protocolBps = (model.tradeFeeBps * METEORA_PROTOCOL_FEE_PCT) / 100
  const claimableBps = model.tradeFeeBps - protocolBps
  const platformBps = claimableBps - model.reflectionBps - creatorBps
  if (platformBps < 0) {
    throw new Error(
      `reflection ${model.reflectionBps} + creator ${creatorBps} bps exceed the claimable ${claimableBps} bps of a ${model.tradeFeeBps} bps fee`,
    )
  }
  return { tradeFeeBps: model.tradeFeeBps, protocolBps, reflectionBps: model.reflectionBps, creatorBps, platformBps, claimableBps }
}

/**
 * Split one claim between holders, the token's creator and the platform, in
 * proportion to their bps of volume. Integer math only; the rounding
 * remainder goes to holders (or, when reflections are off, to the platform),
 * so nothing is invented or lost.
 */
export function splitClaim(claimed: bigint, split: FeeSplit): { holders: bigint; creator: bigint; platform: bigint } {
  // x100 keeps fractional bps (e.g. 0.8 x 450 = 360.0) exact in integers.
  const whole = BigInt(Math.round(split.claimableBps * 100))
  const creator = (claimed * BigInt(Math.round(split.creatorBps * 100))) / whole
  if (split.reflectionBps === 0) return { holders: 0n, creator, platform: claimed - creator }
  const platform = (claimed * BigInt(Math.round(split.platformBps * 100))) / whole
  return { holders: claimed - creator - platform, creator, platform }
}
