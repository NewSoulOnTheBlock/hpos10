import type { PrismaClient } from '@hpos-pad/db'

/** 24h volume, trade count and price change, recomputed in two set-based statements. */
export async function rollups(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Token" t SET
      "volume24hQuote" = COALESCE(s.vol, 0),
      "trades24h"      = COALESCE(s.cnt, 0),
      "priceChange24h" = CASE WHEN p.price0 > 0 THEN (t."priceQuote" - p.price0) / p.price0 * 100 ELSE NULL END
    FROM (
      SELECT tk."mint",
             (SELECT SUM(tr."quoteAmount") FROM "Trade" tr WHERE tr."mint" = tk."mint" AND tr."blockTime" > NOW() - INTERVAL '24 hours') AS vol,
             (SELECT COUNT(*)::int FROM "Trade" tr WHERE tr."mint" = tk."mint" AND tr."blockTime" > NOW() - INTERVAL '24 hours') AS cnt
      FROM "Token" tk
      WHERE tk."lastTradeAt" > NOW() - INTERVAL '25 hours'
    ) s
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (SELECT tr."priceQuote" FROM "Trade" tr WHERE tr."mint" = s."mint" AND tr."blockTime" <= NOW() - INTERVAL '24 hours' ORDER BY tr."blockTime" DESC LIMIT 1),
        (SELECT tr."priceQuote" FROM "Trade" tr WHERE tr."mint" = s."mint" ORDER BY tr."blockTime" ASC LIMIT 1)
      ) AS price0
    ) p ON TRUE
    WHERE t."mint" = s."mint"`

  await prisma.$executeRaw`
    UPDATE "Token" t SET "feesTotalQuote" = COALESCE(s.fees, 0)
    FROM (SELECT "mint", SUM("feeQuote") AS fees FROM "Trade" GROUP BY "mint") s
    WHERE t."mint" = s."mint" AND t."lastTradeAt" > NOW() - INTERVAL '25 hours'`

  // Tokens that went quiet: zero the window instead of leaving stale numbers.
  await prisma.$executeRaw`
    UPDATE "Token" SET "volume24hQuote" = 0, "trades24h" = 0
    WHERE ("lastTradeAt" IS NULL OR "lastTradeAt" <= NOW() - INTERVAL '25 hours') AND "trades24h" <> 0`
}
