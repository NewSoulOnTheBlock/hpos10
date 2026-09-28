import { type Keypair, PublicKey } from '@solana/web3.js'
import { DAMM_V2_MIGRATION_FEE_ADDRESS, MigrationFeeOption } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { derivePoolAddress } from '@meteora-ag/cp-amm-sdk'
import { Prisma, type PrismaClient, toTokenDTO } from '@hpos-pad/db'
import { TOKEN_DECIMALS } from '@hpos-pad/shared'
import type { Redis } from 'ioredis'
import type pino from 'pino'
import { publishEvent } from '../clients/redis.js'
import type { Solana } from '../clients/solana.js'
import { receivedInTx } from '../lib/claims.js'
import type { Sender } from '../lib/tx.js'

type Deps = { prisma: PrismaClient; redis: Redis; solana: Solana; sender: Sender; feeClaimer: Keypair; quoteDecimals: number; logger: pino.Logger }

/**
 * Graduation. Meteora's keepers only auto-migrate pools whose quote mint is
 * Jupiter Verified with an organic score above 50; HPOS10I (and most non-SOL
 * quotes) does not qualify, and a completed curve that is never migrated has
 * trading halted for good. So the platform migrates every completed pool
 * itself, and also notices when a keeper got there first.
 */
export class Migrator {
  constructor(private readonly d: Deps) {}

  async run(): Promise<void> {
    const candidates = await this.d.prisma.token.findMany({
      where: { status: { in: ['CURVE', 'COMPLETE'] } },
      select: { mint: true, pool: true, status: true, quoteReserve: true, migrationThreshold: true },
    })
    for (const t of candidates) {
      const nearlyDone = t.status === 'COMPLETE' || (t.migrationThreshold.gt(0) && t.quoteReserve.gte(t.migrationThreshold))
      if (!nearlyDone) continue
      try {
        await this.graduate(t.mint, t.pool)
      } catch (err) {
        this.d.logger.error({ err: (err as Error).message, mint: t.mint }, 'migration failed; will retry')
      }
    }
  }

  private dammPoolFor(baseMint: string): string {
    const cfg = DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable]!
    return derivePoolAddress(cfg, new PublicKey(baseMint), this.d.solana.quoteMint).toBase58()
  }

  private async graduate(mint: string, pool: string): Promise<void> {
    const state = (await this.d.solana.dbc.state.getPool(pool))?.poolState
    if (!state || !state.config.equals(this.d.solana.config)) return
    const config = await this.d.solana.dbc.state.getPoolConfig(state.config)
    if (!config) return
    const complete = BigInt(state.quoteReserve.toString()) >= BigInt(config.migrationQuoteThreshold.toString())
    if (!complete) return

    let signature: string | null = null
    if (Number(state.isMigrated) !== 1) {
      this.d.logger.info({ mint }, 'curve complete; migrating to DAMM v2')
      const res = await this.d.solana.dbc.migration.migrateToDammV2({
        payer: this.d.feeClaimer.publicKey,
        pool: new PublicKey(pool),
        dammConfig: DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable]!,
      })
      signature = await this.d.sender.send(res.transaction.instructions, [this.d.feeClaimer, res.firstPositionNftKeypair, res.secondPositionNftKeypair], {
        computeUnits: 1_400_000,
      })
    }

    const dammPool = this.dammPoolFor(mint)
    const dammState = await this.d.solana.cpAmm.fetchPoolState(new PublicKey(dammPool))
    const baseIsA = dammState.tokenAMint.toBase58() === mint

    // Any quote the last swap pushed past the threshold is "surplus"; the
    // partner's slice belongs to holders, so it joins this token's carry.
    let surplus = 0n
    try {
      const tx = await this.d.solana.dbc.partner.partnerWithdrawSurplus({ feeClaimer: this.d.feeClaimer.publicKey, pool: new PublicKey(pool) })
      const sig = await this.d.sender.send(tx.instructions, [this.d.feeClaimer])
      surplus = (await receivedInTx(this.d.solana.connection, sig, this.d.feeClaimer.publicKey.toBase58(), this.d.solana.quoteMint.toBase58())) ?? 0n
    } catch {
      // Nothing to withdraw, or already withdrawn.
    }

    const token = await this.d.prisma.token.update({
      where: { mint },
      data: {
        status: 'MIGRATED',
        dammPool,
        dammBaseIsA: baseIsA,
        migratedAt: new Date(),
        migrationSignature: signature,
        ...(surplus > 0n ? { carryQuote: { increment: new Prisma.Decimal(surplus.toString()) } } : {}),
      },
    })
    const usd = await this.d.redis.get('quote:usd').catch(() => null)
    publishEvent(this.d.redis, { type: 'token:update', token: toTokenDTO(token, { base: TOKEN_DECIMALS, quote: this.d.quoteDecimals }, usd ? Number(usd) : null) })
    this.d.logger.info({ mint, dammPool, signature, surplus: surplus.toString() }, 'graduated')
  }
}
