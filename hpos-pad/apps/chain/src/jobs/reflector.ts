import BN from 'bn.js'
import { type Keypair, PublicKey, TransactionInstruction, VersionedTransaction } from '@solana/web3.js'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { U64_MAX, deriveDammV2PoolAuthority, deriveDbcPoolAuthority } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { claimableFor, Prisma, type PrismaClient, type ReflectionEpoch, type Token, totalUnclaimed } from '@hpos-pad/db'
import { type FeeSplit, splitClaim, toRaw, toUi } from '@hpos-pad/shared'
import type { Redis } from 'ioredis'
import type pino from 'pino'
import { publishEvent } from '../clients/redis.js'
import type { Solana } from '../clients/solana.js'
import type { ServiceEnv } from '../config/env.js'
import { receivedInTx } from '../lib/claims.js'
import { claimPositionFeeIxs, findPartnerPosition, pendingPositionQuoteFee } from '../lib/damm.js'
import { allocate, snapshotHolders } from '../lib/holders.js'
import type { Sender } from '../lib/tx.js'
import { MEMO_PROGRAM, claimMemo } from './claim-signer.js'

type Deps = {
  prisma: PrismaClient
  redis: Redis
  solana: Solana
  sender: Sender
  feeClaimer: Keypair
  treasury: PublicKey
  split: FeeSplit
  env: ServiceEnv
  logger: pino.Logger
}

const D = (v: bigint) => new Prisma.Decimal(v.toString())
const raw = (d: Prisma.Decimal) => BigInt(d.toFixed(0))
/** platformSignature marker: the whole platform share stayed in the vault (nothing was sent). */
export const RETAINED = 'retained'
const WSOL = 'So11111111111111111111111111111111111111112'
const bmin = (a: bigint, b: bigint) => (a < b ? a : b)

/**
 * Reflections: claim each token's trading fees, send the platform share to
 * the treasury, and pay the holder share pro-rata to every holder, in the
 * quote token.
 *
 * Crash safety is the whole design. Every transaction's signature is written
 * to the ledger BEFORE it is broadcast (Sender.onSigned). After a crash the
 * chain, not memory, decides what happened: a recorded signature that landed
 * is kept, one that never landed is cleared and retried. So a payout can be
 * delayed by a crash but never sent twice, and no claimed unit goes
 * unaccounted: it is distributed, carried to the next epoch, or recorded as
 * the platform share.
 */
export class Reflector {
  private readonly quoteMint: string
  private readonly quoteDecimals: number
  private readonly minPayout: bigint
  private readonly minClaim: bigint

  constructor(private readonly d: Deps) {
    this.quoteMint = d.solana.quoteMint.toBase58()
    this.quoteDecimals = d.env.QUOTE_DECIMALS
    this.minPayout = toRaw(String(d.env.REFLECT_MIN_PAYOUT_QUOTE), this.quoteDecimals)
    this.minClaim = toRaw(String(d.env.REFLECT_MIN_CLAIM_QUOTE), this.quoteDecimals)
  }

  async run(): Promise<void> {
    await this.recover()
    // No global halt: claiming fees and crediting shares always continue (the
    // platform share that stays in the vault is what closes a shortfall).
    // Only money leaving to holders waits for solvency; see distribute().
    const tokens = await this.d.prisma.token.findMany({ orderBy: { lastTradeAt: { sort: 'desc', nulls: 'last' } } })
    for (const token of tokens) {
      try {
        await this.epoch(token)
      } catch (err) {
        this.d.logger.error({ err: (err as Error).message, mint: token.mint }, 'reflection epoch failed')
      }
    }
    await this.topUpGas().catch((err: Error) => this.d.logger.error({ err: err.message }, 'gas top-up failed'))
    if (this.d.env.REFLECT_CREATE_ATAS) {
      await this.settleAccruals().catch((err: Error) => this.d.logger.error({ err: err.message }, 'auto-settle failed'))
    }
  }

  /* ----------------------------- auto-settle ------------------------------ */

  /**
   * Pay accrued balances without the holder doing anything. Each payment is
   * an ordinary Claim row (so the ledger, the site and the api reconciler
   * treat it exactly like a claim made on the site), carrying the same
   * `hpospad:claim:<id>` memo. The fee claimer pays the fee and, for holders
   * without a quote-token account, the account rent (the account is theirs).
   *
   * Safety: rows are reserved under the same per-owner advisory lock the api
   * uses, signature + expiry are recorded before broadcast, and a batch that
   * throws is left PENDING for the reconciler to settle against the chain
   * (landed → LANDED, expired unlanded → EXPIRED, balance released).
   */
  private async settleAccruals(): Promise<void> {
    const shortfall = await this.shortfall()
    if (shortfall > 0n) {
      this.d.logger.warn({ shortfall: toUi(shortfall, this.quoteDecimals) }, 'vault below owed: auto-settle paused')
      return
    }
    const rows = await this.d.prisma.$queryRaw<{ owner: string; claimable: string }[]>`
      WITH acc AS (
        SELECT p."owner", SUM(p."amount") AS a FROM "ReflectionPayout" p JOIN "ReflectionEpoch" e ON e."id" = p."epochId"
        WHERE p."signature" IS NULL AND e."status" = 'DONE' GROUP BY p."owner"),
      res AS (SELECT "owner", SUM("amount") AS r FROM "Claim" WHERE "status" IN ('PENDING', 'LANDED') GROUP BY "owner")
      SELECT acc."owner", (acc.a - COALESCE(res.r, 0))::text AS claimable FROM acc LEFT JOIN res ON res."owner" = acc."owner"
      WHERE acc.a - COALESCE(res.r, 0) >= ${D(this.minPayout)}
        AND NOT EXISTS (SELECT 1 FROM "Claim" c WHERE c."owner" = acc."owner" AND c."status" = 'PENDING')
      ORDER BY 2 DESC`
    const candidates = rows.filter((r) => PublicKey.isOnCurve(new PublicKey(r.owner).toBytes()))
    if (candidates.length === 0) return

    const withAta = await this.ataExists(candidates.map((r) => r.owner))
    const ataMin = toRaw(String(this.d.env.REFLECT_ATA_MIN_QUOTE), this.quoteDecimals)
    const rent = 2_039_280
    const reserve = Math.round(this.d.env.REFLECT_SOL_RESERVE * 1e9)
    let sol = await this.d.solana.connection.getBalance(this.d.feeClaimer.publicKey)
    let opens = 0
    const chosen: { owner: string; open: boolean }[] = []
    for (const r of candidates) {
      if (withAta.has(r.owner)) chosen.push({ owner: r.owner, open: false })
      else if (BigInt(r.claimable.split('.')[0]!) >= ataMin && opens < this.d.env.REFLECT_MAX_ATAS_PER_EPOCH && sol - rent > reserve) {
        chosen.push({ owner: r.owner, open: true })
        opens++
        sol -= rent
      }
    }

    const mint = this.d.solana.quoteMint
    const payer = this.d.feeClaimer.publicKey
    const vault = getAssociatedTokenAddressSync(mint, payer, false, this.d.solana.quoteProgram)
    let paid = 0
    let opened = 0
    const per = 5
    for (let i = 0; i < chosen.length; i += per) {
      // Reserve each owner's current claimable as a Claim, under the api's lock.
      const claims: { id: string; owner: string; amount: bigint; open: boolean }[] = []
      for (const c of chosen.slice(i, i + per)) {
        const claim = await this.d.prisma.$transaction(async (db) => {
          await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${c.owner}))`
          if (await db.claim.findFirst({ where: { owner: c.owner, status: 'PENDING' } })) return null
          const { claimable } = await claimableFor(db as PrismaClient, c.owner)
          if (claimable < this.minPayout) return null
          return db.claim.create({ data: { owner: c.owner, amount: D(claimable), status: 'PENDING', lastValidBlockHeight: 0n } })
        })
        if (claim) claims.push({ id: claim.id, owner: c.owner, amount: raw(claim.amount), open: c.open })
      }
      if (claims.length === 0) continue
      const ids = claims.map((c) => c.id)
      const ixs = claims.flatMap((c) => {
        const owner = new PublicKey(c.owner)
        const dest = getAssociatedTokenAddressSync(mint, owner, false, this.d.solana.quoteProgram)
        return [
          ...(c.open ? [createAssociatedTokenAccountIdempotentInstruction(payer, dest, owner, mint, this.d.solana.quoteProgram)] : []),
          createTransferCheckedInstruction(vault, mint, dest, payer, c.amount, this.quoteDecimals, [], this.d.solana.quoteProgram),
          new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(claimMemo(c.id)) }),
        ]
      })
      try {
        const sig = await this.d.sender.send(ixs, [this.d.feeClaimer], {
          computeUnits: 60_000 * claims.length + 50_000,
          onSigned: async (signature, lastValidBlockHeight) =>
            void (await this.d.prisma.claim.updateMany({ where: { id: { in: ids } }, data: { signature, lastValidBlockHeight: BigInt(lastValidBlockHeight) } })),
        })
        await this.d.prisma.claim.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'LANDED', signature: sig, settledAt: new Date() } })
        paid += claims.length
        opened += claims.filter((c) => c.open).length
      } catch (err) {
        // Not provably unlanded: the api reconciler settles these rows against the chain.
        this.d.logger.warn({ err: (err as Error).message, claims: ids.length }, 'auto-settle batch failed; reconciler will settle it')
      }
    }
    if (paid > 0) this.d.logger.info({ paid, opened, waiting: candidates.length - chosen.length }, 'accrued balances auto-settled')
  }

  /* ------------------------------ one epoch ------------------------------ */

  private async epoch(token: Token): Promise<void> {
    const feeClaimer = this.d.feeClaimer
    const claims: { label: string; ixs: () => Promise<TransactionInstruction[]> }[] = []
    let pending = 0n

    // Pre-graduation fees accrue on the DBC pool. Any left unclaimed at
    // graduation stay there and remain claimable, so always check it.
    const dbcState = (await this.d.solana.dbc.state.getPool(token.pool))?.poolState
    const dbcPending = dbcState ? BigInt(dbcState.partnerQuoteFee.toString()) : 0n
    if (dbcPending > 0n) {
      pending += dbcPending
      claims.push({
        label: 'dbc',
        ixs: async () =>
          (
            await this.d.solana.dbc.partner.claimPartnerTradingFee({
              feeClaimer: feeClaimer.publicKey,
              payer: feeClaimer.publicKey,
              pool: new PublicKey(token.pool),
              maxBaseAmount: new BN(0),
              maxQuoteAmount: U64_MAX,
            })
          ).instructions,
      })
    }

    if (token.status === 'MIGRATED' && token.dammPool) {
      const pos = await findPartnerPosition(this.d.solana.cpAmm, token.dammPool, feeClaimer.publicKey)
      if (pos) {
        const p = await pendingPositionQuoteFee(this.d.solana.cpAmm, pos, token.dammBaseIsA)
        if (p > 0n) {
          pending += p
          claims.push({ label: 'damm', ixs: () => claimPositionFeeIxs(this.d.solana.cpAmm, pos, feeClaimer) })
        }
      }
    }

    if (pending < this.minClaim) return

    // Open the epoch and move the token's carry into it atomically.
    const epoch = await this.d.prisma.$transaction(async (db) => {
      const t = await db.token.findUniqueOrThrow({ where: { mint: token.mint } })
      await db.token.update({ where: { mint: token.mint }, data: { carryQuote: D(0n) } })
      return db.reflectionEpoch.create({
        data: {
          mint: token.mint,
          status: 'CLAIMED',
          venue: token.status === 'MIGRATED' ? 'DAMM_V2' : 'DBC',
          claimedQuote: D(0n),
          holdersQuote: D(0n),
          platformQuote: D(0n),
          carryInQuote: t.carryQuote,
          claimSignatures: [],
        },
      })
    })

    for (const c of claims) {
      await this.d.sender.send(await c.ixs(), [feeClaimer], {
        onSigned: async (sig) => {
          await this.d.prisma.reflectionEpoch.update({ where: { id: epoch.id }, data: { claimSignatures: { push: sig } } })
        },
      }).catch((err: Error) => this.d.logger.warn({ err: err.message, mint: token.mint, claim: c.label }, 'claim failed'))
    }

    await this.settleClaims(epoch.id)
    await this.sendPlatformShare(epoch.id)
    await this.sendCreatorShare(epoch.id)
    await this.distribute(epoch.id)
  }

  /** Measure what the recorded claim transactions actually delivered, and split it. */
  private async settleClaims(epochId: string): Promise<void> {
    const e = await this.d.prisma.reflectionEpoch.findUniqueOrThrow({ where: { id: epochId } })
    let claimed = 0n
    for (const sig of e.claimSignatures) {
      claimed += (await receivedInTx(this.d.solana.connection, sig, this.d.feeClaimer.publicKey.toBase58(), this.quoteMint)) ?? 0n
    }
    const { holders, creator, platform } = splitClaim(claimed, this.d.split)
    await this.d.prisma.reflectionEpoch.update({
      where: { id: epochId },
      data: { claimedQuote: D(claimed), holdersQuote: D(holders), creatorQuote: D(creator), platformQuote: D(platform) },
    })
  }

  private async sendPlatformShare(epochId: string): Promise<void> {
    const e = await this.d.prisma.reflectionEpoch.findUniqueOrThrow({ where: { id: epochId } })
    const amount = raw(e.platformQuote)
    if (amount === 0n || e.platformSignature) return
    // Treasury is the fee claimer itself: the platform share already sits
    // where it belongs. `pnpm treasury` reports what is withdrawable.
    if (this.d.treasury.equals(this.d.feeClaimer.publicKey)) return
    const retain = await this.platformRetention(e, amount)
    if (retain > 0n) this.d.logger.warn({ epoch: epochId, retained: toUi(retain, this.quoteDecimals) }, 'platform share kept in vault (shortfall / gas)')
    if (retain === amount) {
      await this.d.prisma.reflectionEpoch.update({ where: { id: epochId }, data: { platformSignature: RETAINED, platformRetainedQuote: D(retain) } })
      return
    }
    const mint = this.d.solana.quoteMint
    const src = getAssociatedTokenAddressSync(mint, this.d.feeClaimer.publicKey, false, this.d.solana.quoteProgram)
    const dst = getAssociatedTokenAddressSync(mint, this.d.treasury, true, this.d.solana.quoteProgram)
    try {
      await this.d.sender.send(
        [
          createAssociatedTokenAccountIdempotentInstruction(this.d.feeClaimer.publicKey, dst, this.d.treasury, mint, this.d.solana.quoteProgram),
          createTransferCheckedInstruction(src, mint, dst, this.d.feeClaimer.publicKey, amount - retain, this.quoteDecimals, [], this.d.solana.quoteProgram),
        ],
        [this.d.feeClaimer],
        {
          onSigned: async (sig) =>
            void (await this.d.prisma.reflectionEpoch.update({ where: { id: epochId }, data: { platformSignature: sig, platformRetainedQuote: D(retain) } })),
        },
      )
    } catch (err) {
      await this.clearIfNotLanded(epochId, 'platform')
      throw err
    }
  }

  /** The creator's share, to the wallet that launched the token. Same crash-safety as the platform share. */
  private async sendCreatorShare(epochId: string): Promise<void> {
    const e = await this.d.prisma.reflectionEpoch.findUniqueOrThrow({ where: { id: epochId }, include: { token: { select: { creator: true } } } })
    const amount = raw(e.creatorQuote)
    if (amount === 0n || e.creatorSignature) return
    const creator = new PublicKey(e.token.creator)
    if (creator.equals(this.d.feeClaimer.publicKey)) return
    const mint = this.d.solana.quoteMint
    const src = getAssociatedTokenAddressSync(mint, this.d.feeClaimer.publicKey, false, this.d.solana.quoteProgram)
    const dst = getAssociatedTokenAddressSync(mint, creator, true, this.d.solana.quoteProgram)
    try {
      await this.d.sender.send(
        [
          // One account per creator, ever (~0.002 SOL rent, paid once by the fee claimer).
          createAssociatedTokenAccountIdempotentInstruction(this.d.feeClaimer.publicKey, dst, creator, mint, this.d.solana.quoteProgram),
          createTransferCheckedInstruction(src, mint, dst, this.d.feeClaimer.publicKey, amount, this.quoteDecimals, [], this.d.solana.quoteProgram),
        ],
        [this.d.feeClaimer],
        { onSigned: async (sig) => void (await this.d.prisma.reflectionEpoch.update({ where: { id: epochId }, data: { creatorSignature: sig } })) },
      )
    } catch (err) {
      await this.clearIfNotLanded(epochId, 'creator')
      throw err
    }
  }

  /* ----------------------------- distribution ----------------------------- */

  private async excludedFor(token: Token): Promise<Set<string>> {
    const set = new Set<string>([
      deriveDbcPoolAuthority().toBase58(),
      deriveDammV2PoolAuthority().toBase58(),
      this.d.feeClaimer.publicKey.toBase58(),
      this.d.treasury.toBase58(),
      token.pool,
      ...(token.dammPool ? [token.dammPool] : []),
      ...this.d.env.REFLECT_EXCLUDE.split(',').map((s) => s.trim()).filter(Boolean),
    ])
    return set
  }

  private async ataExists(owners: string[]): Promise<Set<string>> {
    const mint = this.d.solana.quoteMint
    const exists = new Set<string>()
    for (let i = 0; i < owners.length; i += 100) {
      const chunk = owners.slice(i, i + 100)
      const infos = await this.d.solana.connection.getMultipleAccountsInfo(
        chunk.map((o) => getAssociatedTokenAddressSync(mint, new PublicKey(o), false, this.d.solana.quoteProgram)),
      )
      infos.forEach((info, j) => info && exists.add(chunk[j]!))
    }
    return exists
  }

  /**
   * Hybrid payout. The holder share (plus carry) is allocated pro-rata to
   * every eligible holder and written to the ledger first. Holders who
   * already have a quote-token account (and a share worth sending) are paid
   * automatically; everyone else's share stays on the ledger as a claimable
   * balance they withdraw with a claim (paying their own account rent). A
   * push that fails also falls back to claimable. So every holder is
   * credited exactly their share, and nobody's share goes to anyone else.
   *
   * Double-pay safety: each batch's signature is recorded before broadcast;
   * a row only becomes claimable once its batch has definitely not landed.
   */
  private async distribute(epochId: string): Promise<void> {
    let e = await this.d.prisma.reflectionEpoch.findUniqueOrThrow({ where: { id: epochId }, include: { token: true } })
    if (e.status === 'DONE') return

    // Reflections off (or nothing for holders this epoch): no snapshot, no payouts.
    if (e.status === 'CLAIMED' && raw(e.holdersQuote) + raw(e.carryInQuote) === 0n) {
      await this.finalize(e.id, e.mint, 0n, 0n, 0)
      return
    }

    // 1. Allocate once, to everyone eligible. The rows are the ledger.
    if (e.status === 'CLAIMED' && (await this.d.prisma.reflectionPayout.count({ where: { epochId } })) === 0) {
      const pot = raw(e.holdersQuote) + raw(e.carryInQuote)
      const holders = await snapshotHolders(this.d.solana.connection, e.token.mint)
      const alloc = allocate(holders, pot, { minPayout: 1n, minHoldingBps: this.d.env.REFLECT_MIN_HOLDING_BPS, excluded: await this.excludedFor(e.token) })
      await this.d.prisma.$transaction([
        this.d.prisma.reflectionPayout.createMany({ data: alloc.payouts.map((p) => ({ epochId, mint: e.mint, owner: p.owner, amount: D(p.amount) })) }),
        this.d.prisma.reflectionEpoch.update({ where: { id: epochId }, data: { status: 'DISTRIBUTING', carriedQuote: D(alloc.carry), recipients: alloc.payouts.length } }),
      ])
      e = await this.d.prisma.reflectionEpoch.findUniqueOrThrow({ where: { id: epochId }, include: { token: true } })
    }

    // 2. Push to holders who can receive and whose share is worth a transfer,
    //    but only while the vault covers everything owed (this epoch included).
    //    Otherwise the shares stay claimable and nothing leaves the vault.
    const unsent = await this.d.prisma.reflectionPayout.findMany({ where: { epochId, signature: null }, orderBy: { id: 'asc' } })
    const thisEpoch = unsent.reduce((a, p) => a + raw(p.amount), 0n)
    const shortfall = await this.shortfall(thisEpoch)
    if (shortfall > 0n) {
      this.d.logger.warn({ mint: e.mint, shortfall: toUi(shortfall, this.quoteDecimals) }, 'vault below owed: pushes paused, shares credited as claimable')
      unsent.length = 0
    }
    const withAta = await this.ataExists(unsent.map((p) => p.owner))
    const pushable = unsent.filter((p) => withAta.has(p.owner) && raw(p.amount) >= this.minPayout)
    const mint = this.d.solana.quoteMint
    const src = getAssociatedTokenAddressSync(mint, this.d.feeClaimer.publicKey, false, this.d.solana.quoteProgram)
    const per = this.d.env.REFLECT_TRANSFERS_PER_TX
    for (let i = 0; i < pushable.length; i += per) {
      const batch = pushable.slice(i, i + per)
      const ids = batch.map((p) => p.id)
      const ixs = batch.map((p) =>
        createTransferCheckedInstruction(src, mint, getAssociatedTokenAddressSync(mint, new PublicKey(p.owner), false, this.d.solana.quoteProgram), this.d.feeClaimer.publicKey, raw(p.amount), this.quoteDecimals, [], this.d.solana.quoteProgram),
      )
      try {
        await this.d.sender.send(ixs, [this.d.feeClaimer], {
          computeUnits: 40_000 * batch.length + 50_000,
          onSigned: async (sig) => void (await this.d.prisma.reflectionPayout.updateMany({ where: { id: { in: ids } }, data: { signature: sig } })),
        })
      } catch (err) {
        // Sender only throws once the batch is known not to have landed: these rows become claimable.
        await this.d.prisma.reflectionPayout.updateMany({ where: { id: { in: ids } }, data: { signature: null } })
        this.d.logger.warn({ err: (err as Error).message, mint: e.mint, rows: ids.length }, 'push batch failed; shares stay claimable')
      }
    }

    // 3. Done: pushed rows are paid, the rest are claimable accruals.
    const rows = await this.d.prisma.reflectionPayout.findMany({ where: { epochId }, select: { amount: true } })
    const credited = rows.reduce((a, r) => a + raw(r.amount), 0n)
    await this.d.prisma.$transaction(async (db) => {
      await this.finalize(e.id, e.mint, credited, raw(e.carriedQuote), rows.length, db)
    })
  }

  private async finalize(
    epochId: string,
    mint: string,
    credited: bigint,
    carried: bigint,
    recipients: number,
    db: Pick<PrismaClient, 'reflectionEpoch' | 'token'> = this.d.prisma,
  ): Promise<void> {
    const e = await db.reflectionEpoch.findUniqueOrThrow({ where: { id: epochId } })
    await db.reflectionEpoch.update({
      where: { id: epochId },
      data: { status: 'DONE', distributedQuote: D(credited), carriedQuote: D(carried), recipients, finishedAt: new Date() },
    })
    await db.token.update({
      where: { mint },
      data: {
        reflectedTotalQuote: { increment: D(credited) },
        carryQuote: { increment: D(carried) },
        creatorEarnedQuote: { increment: e.creatorSignature ? e.creatorQuote : D(0n) },
      },
    })
    publishEvent(this.d.redis, { type: 'reflection', mint, epochId, distributedQuote: toUi(credited, this.quoteDecimals), recipients })
    this.d.logger.info(
      { mint, credited: toUi(credited, this.quoteDecimals), carried: toUi(carried, this.quoteDecimals), recipients },
      'reflection epoch credited',
    )
  }

  /* ------------------------------- recovery ------------------------------- */

  private async clearIfNotLanded(epochId: string, which: 'platform' | 'creator'): Promise<void> {
    const e = await this.d.prisma.reflectionEpoch.findUniqueOrThrow({ where: { id: epochId } })
    const sig = which === 'platform' ? e.platformSignature : e.creatorSignature
    if (sig && sig !== RETAINED && (await this.d.sender.landed(sig)) !== 'landed') {
      await this.d.prisma.reflectionEpoch.update({
        where: { id: epochId },
        data: which === 'platform' ? { platformSignature: null } : { creatorSignature: null },
      })
    }
  }

  /** Resume every epoch a previous run left open. The chain is the source of truth. */
  private async recover(): Promise<void> {
    const open: ReflectionEpoch[] = await this.d.prisma.reflectionEpoch.findMany({
      where: { status: { in: ['CLAIMED', 'DISTRIBUTING'] } },
      orderBy: { createdAt: 'asc' },
    })
    for (const e of open) {
      this.d.logger.warn({ epoch: e.id, mint: e.mint, status: e.status }, 'recovering open epoch')
      try {
        if (e.status === 'CLAIMED' && raw(e.claimedQuote) === 0n && e.claimSignatures.length > 0) await this.settleClaims(e.id)
        if (e.platformSignature && e.platformSignature !== RETAINED && (await this.d.sender.landed(e.platformSignature)) !== 'landed') await this.clearIfNotLanded(e.id, 'platform')
        await this.sendPlatformShare(e.id)
        if (e.creatorSignature && (await this.d.sender.landed(e.creatorSignature)) !== 'landed') await this.clearIfNotLanded(e.id, 'creator')
        await this.sendCreatorShare(e.id)

        await this.distribute(e.id)
      } catch (err) {
        this.d.logger.error({ err: (err as Error).message, epoch: e.id }, 'recovery failed; will retry')
      }
    }
  }

  /**
   * The fee claimer's quote balance must cover every token's carry (money
   * owed to holders but not yet sent). If it does not, something outside
   * this service moved funds; stop rather than pay one token's holders with
   * another's.
   */
  /** Vault quote balance minus everything owed to holders (and `extraOwed`); negative = shortfall. */
  private async margin(extraOwed = 0n): Promise<bigint> {
    const owed = await this.d.prisma.token.aggregate({ _sum: { carryQuote: true } })
    const need = (owed._sum.carryQuote ? raw(owed._sum.carryQuote) : 0n) + (await totalUnclaimed(this.d.prisma)) + extraOwed
    let have = 0n
    try {
      have = (await getAccount(this.d.solana.connection, getAssociatedTokenAddressSync(this.d.solana.quoteMint, this.d.feeClaimer.publicKey, false, this.d.solana.quoteProgram), 'confirmed', this.d.solana.quoteProgram)).amount
    } catch {
      have = 0n
    }
    return have - need
  }

  /** How far the vault's quote balance is below everything owed to holders (0 when solvent). */
  private async shortfall(extraOwed = 0n): Promise<bigint> {
    const m = await this.margin(extraOwed)
    return m < 0n ? -m : 0n
  }

  /**
   * How much of this epoch's platform share stays in the vault: first
   * whatever the vault is short of what it owes holders (so a shortfall is
   * always made good by the platform, never by holders), then, while SOL is
   * low, enough quote for topUpGas() to buy gas with.
   */
  private async platformRetention(e: ReflectionEpoch, amount: bigint): Promise<bigint> {
    // Still in the vault besides the platform share: this epoch's holder pot, and the creator share if unsent.
    const pending = raw(e.holdersQuote) + raw(e.carryInQuote) + (e.creatorSignature ? 0n : raw(e.creatorQuote))
    const free = (await this.margin(pending)) - amount // surplus if the whole share were sent
    let want = free < 0n ? -free : 0n
    const sol = await this.d.solana.connection.getBalance(this.d.feeClaimer.publicKey)
    if (sol < this.d.env.GAS_MIN_SOL * 1e9) {
      const gas = toRaw(String(this.d.env.GAS_TOPUP_QUOTE), this.quoteDecimals)
      const surplus = free > 0n ? free : 0n
      if (gas > surplus) want += gas - surplus
    }
    return bmin(want, amount)
  }

  /**
   * Keep the fee claimer in SOL: sell vault surplus (retained platform
   * income only; everything owed to holders is excluded) for SOL via Jupiter.
   */
  private async topUpGas(): Promise<void> {
    const sol = await this.d.solana.connection.getBalance(this.d.feeClaimer.publicKey)
    if (sol >= this.d.env.GAS_MIN_SOL * 1e9) return
    if ((await this.d.prisma.reflectionEpoch.count({ where: { status: { in: ['CLAIMED', 'DISTRIBUTING'] } } })) > 0) return
    const surplus = await this.margin()
    const amount = bmin(surplus, toRaw(String(this.d.env.GAS_TOPUP_QUOTE), this.quoteDecimals))
    if (amount < toRaw('5', this.quoteDecimals)) {
      this.d.logger.warn({ sol: sol / 1e9, surplus: toUi(surplus > 0n ? surplus : 0n, this.quoteDecimals) }, 'SOL low and no platform surplus to sell yet')
      return
    }
    const base = this.d.env.JUPITER_API_URL.replace(/\/$/, '')
    const headers = { 'content-type': 'application/json', ...(this.d.env.JUPITER_API_KEY ? { 'x-api-key': this.d.env.JUPITER_API_KEY } : {}) }
    const qs = new URLSearchParams({ inputMint: this.quoteMint, outputMint: WSOL, amount: amount.toString(), slippageBps: '150' })
    const quoteRes = await fetch(`${base}/quote?${qs}`, { headers, signal: AbortSignal.timeout(15_000) })
    if (!quoteRes.ok) throw new Error(`jupiter quote ${quoteRes.status}`)
    const quote = await quoteRes.json()
    const swapRes = await fetch(`${base}/swap`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: this.d.feeClaimer.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: 20_000 }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!swapRes.ok) throw new Error(`jupiter swap ${swapRes.status}`)
    const { swapTransaction } = (await swapRes.json()) as { swapTransaction: string }
    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'))
    tx.sign([this.d.feeClaimer])
    // Jupiter built it; before sending, check by simulation that it takes no more than `amount` from the vault.
    const conn = this.d.solana.connection
    const vault = getAssociatedTokenAddressSync(this.d.solana.quoteMint, this.d.feeClaimer.publicKey, false, this.d.solana.quoteProgram)
    const before = (await getAccount(conn, vault, 'confirmed', this.d.solana.quoteProgram)).amount
    const sim = await conn.simulateTransaction(tx, { sigVerify: false, accounts: { encoding: 'base64', addresses: [vault.toBase58()] } })
    if (sim.value.err) throw new Error(`gas swap simulation failed: ${JSON.stringify(sim.value.err)}`)
    const post = sim.value.accounts?.[0]?.data?.[0]
    const spent = post ? before - Buffer.from(post, 'base64').readBigUInt64LE(64) : -1n
    if (spent < 0n || spent > amount) throw new Error(`gas swap would move ${spent} from the vault, expected <= ${amount}; refusing`)
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 })
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1_000))
      const st = (await conn.getSignatureStatus(sig)).value
      if (st?.err) throw new Error(`gas swap ${sig} failed: ${JSON.stringify(st.err)}`)
      if (st?.confirmationStatus === 'confirmed' || st?.confirmationStatus === 'finalized') break
    }
    const after = await conn.getBalance(this.d.feeClaimer.publicKey)
    this.d.logger.info({ sold: toUi(amount, this.quoteDecimals), solBefore: sol / 1e9, solAfter: after / 1e9, signature: sig }, 'gas top-up: platform quote sold for SOL')
  }

  private async assertSolvent(): Promise<void> {
    const owed = await this.d.prisma.token.aggregate({ _sum: { carryQuote: true } })
    const need = (owed._sum.carryQuote ? raw(owed._sum.carryQuote) : 0n) + (await totalUnclaimed(this.d.prisma))
    let have = 0n
    try {
      have = (await getAccount(this.d.solana.connection, getAssociatedTokenAddressSync(this.d.solana.quoteMint, this.d.feeClaimer.publicKey, false, this.d.solana.quoteProgram), 'confirmed', this.d.solana.quoteProgram)).amount
    } catch {
      have = 0n
    }
    if (have < need) {
      throw new Error(
        `fee claimer holds ${toUi(have, this.quoteDecimals)} but owes holders ${toUi(need, this.quoteDecimals)} (unclaimed + carry); refusing to distribute`,
      )
    }
  }
}
