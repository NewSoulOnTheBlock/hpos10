import { Prisma, type PrismaClient } from '@hpos-pad/db'
import type pino from 'pino'
import type { Solana } from '../clients/solana.js'
import { snapshotHolders } from '../lib/holders.js'

/**
 * Refresh the holder table for tokens that traded since their last sync.
 * The UI reads the top holders and the count from here; the reflector takes
 * its own fresh snapshot at payout time and never trusts this table.
 */
export async function syncHolders(prisma: PrismaClient, solana: Solana, logger: pino.Logger): Promise<void> {
  const since = new Date(Date.now() - 24 * 3_600_000)
  const tokens = await prisma.token.findMany({ where: { lastTradeAt: { gte: since } }, select: { mint: true } })
  for (const { mint } of tokens) {
    try {
      const holders = await snapshotHolders(solana.connection, mint)
      const top = holders.slice(0, 500)
      await prisma.$transaction([
        prisma.holder.deleteMany({ where: { mint } }),
        prisma.holder.createMany({ data: top.map((h) => ({ mint, owner: h.owner, amount: new Prisma.Decimal(h.amount.toString()) })) }),
        prisma.token.update({ where: { mint }, data: { holders: holders.length } }),
      ])
    } catch (err) {
      logger.warn({ err: (err as Error).message, mint }, 'holder sync failed')
    }
  }
}
