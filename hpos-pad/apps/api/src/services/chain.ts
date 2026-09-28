import BN from 'bn.js'
import {
  type AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  DynamicBondingCurveClient,
  type PoolConfig,
  SwapMode,
  type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { TOKEN_DECIMALS, type BuiltTransaction, type PayWith, type TradeQuote, toRaw, toUi } from '@hpos-pad/shared'
import type { Env } from '../config/env.js'
import { HttpError } from '../middleware/errors.js'
import { type JupQuote, Jupiter, WSOL, isRouteSpecificFailure, toIx } from './jupiter.js'

const COMPUTE_BUDGET = ComputeBudgetProgram.programId.toBase58()
const SOL_DECIMALS = 9
const MAX_TX_BYTES = 1232

type TokenRef = { mint: string; pool: string; status: 'CURVE' | 'COMPLETE' | 'MIGRATED' }

type Plan = {
  quote: TradeQuote
  /** Build the instructions for this plan (quotes are re-used, not refetched). */
  build: (owner: PublicKey) => Promise<{ ixs: TransactionInstruction[]; alts: string[] }>
}

/**
 * Everything that touches the chain for the api: DBC state reads, quotes,
 * and transaction assembly. Transactions are built server-side (the SDKs
 * stay out of the browser bundle), returned unsigned, and signed by the
 * user's wallet (plus the mint keypair for launches, which never leaves the
 * browser).
 */
export class Chain {
  readonly connection: Connection
  readonly dbc: DynamicBondingCurveClient
  /** Quotes read pool state at 'processed', the same state simulation runs against. */
  private readonly dbcProcessed: DynamicBondingCurveClient
  readonly config: PublicKey
  readonly quoteMint: PublicKey
  poolConfig!: PoolConfig
  private readonly jup: Jupiter

  constructor(private readonly env: Env) {
    this.connection = new Connection(env.RPC_URL, 'confirmed')
    this.dbc = new DynamicBondingCurveClient(this.connection, 'confirmed')
    this.dbcProcessed = new DynamicBondingCurveClient(this.connection, 'processed')
    this.config = new PublicKey(env.DBC_CONFIG)
    this.quoteMint = new PublicKey(env.QUOTE_MINT)
    this.jup = new Jupiter(env.JUPITER_API_URL, env.JUPITER_API_KEY, env.JUPITER_MAX_ACCOUNTS)
  }

  async init(): Promise<void> {
    const cfg = await this.dbc.state.getPoolConfig(this.config)
    if (!cfg) throw new Error(`DBC config ${this.config.toBase58()} not found on chain`)
    this.poolConfig = cfg
  }

  /* ------------------------------ helpers ------------------------------ */

  private dec(asset: 'SOL' | 'QUOTE' | 'TOKEN'): number {
    return asset === 'SOL' ? SOL_DECIMALS : asset === 'QUOTE' ? this.env.QUOTE_DECIMALS : TOKEN_DECIMALS
  }

  /**
   * The point (slot or unix time) fees and activation are evaluated at. The
   * SDK's getCurrentPoint asks for the block time of the newest slot, which
   * RPCs often have not produced yet ("Block not available for slot").
   * The Clock sysvar is always readable and is exactly what the program sees.
   */
  private pointCache: { at: number; v: BN } | null = null
  private async currentPoint(): Promise<BN> {
    if (this.pointCache && Date.now() - this.pointCache.at < 1_000) return this.pointCache.v
    let v: BN
    if (this.poolConfig.activationType === 0) {
      v = new BN(await this.connection.getSlot('confirmed'))
    } else {
      const clock = await this.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, 'confirmed')
      // Clock layout: slot u64 | epoch_start_timestamp i64 | epoch u64 | leader_schedule_epoch u64 | unix_timestamp i64
      v = clock ? new BN(clock.data.readBigInt64LE(32).toString()) : new BN(Math.floor(Date.now() / 1000))
    }
    this.pointCache = { at: Date.now(), v }
    return v
  }

  private poolCache = new Map<string, { at: number; v: VirtualPool }>()
  private async virtualPool(pool: string): Promise<VirtualPool> {
    const hit = this.poolCache.get(pool)
    if (hit && Date.now() - hit.at < 1_500) return hit.v
    // The account wraps its fields in `poolState`; the quote functions want the whole account.
    const v = (await this.dbcProcessed.state.getPool(pool)) as VirtualPool | null
    if (!v) throw new HttpError(404, 'pool not found on chain')
    this.poolCache.set(pool, { at: Date.now(), v })
    return v
  }

  /** DBC exact-in quote against live pool state (or a fresh pool, for a launch's first buy). */
  private async dbcQuote(pool: string | null, swapBaseForQuote: boolean, amountIn: bigint, slippageBps: number, partial = false) {
    const params = {
      config: this.poolConfig,
      swapBaseForQuote,
      amountIn: new BN(amountIn.toString()),
      slippageBps,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint: await this.currentPoint(),
      swapMode: (partial ? SwapMode.PartialFill : SwapMode.ExactIn) as SwapMode.ExactIn,
    }
    const virtualPool = pool ? await this.virtualPool(pool) : null
    let r: ReturnType<DynamicBondingCurveClient['pool']['swapQuote2']>
    try {
      r = virtualPool
        ? this.dbc.pool.swapQuote2({ ...params, virtualPool })
        : this.dbc.pool.getQuoteFromInputAmount(params as never)
    } catch (err) {
      // The SDK's quote math throws plain Errors for conditions the user caused.
      const msg = (err as Error).message
      if (/Insufficient Liquidity/i.test(msg)) throw new HttpError(422, 'not enough liquidity in the curve for this amount; try a smaller one')
      if (/pool is completed/i.test(msg)) throw new HttpError(409, 'the curve is complete and graduating; trading resumes on DAMM v2 shortly')
      if (/Amount is zero/i.test(msg)) throw new HttpError(400, 'amount is too small')
      throw err
    }
    const fee = BigInt(r.tradingFee.toString()) + BigInt(r.protocolFee.toString()) + BigInt(r.referralFee.toString())
    // PartialFill consumes only what the curve can take; the rest is never spent.
    const used = BigInt(r.includedFeeInputAmount.toString())
    return { out: BigInt(r.outputAmount.toString()), minOut: BigInt((r.minimumAmountOut ?? r.outputAmount).toString()), fee, used, partial }
  }

  /* ------------------------------ planning ------------------------------ */

  /**
   * Plan a trade. Pre-graduation trades go through the DBC pool, with an
   * optional Jupiter SOL<->quote leg in the same transaction. Post-graduation
   * the whole trade is a Jupiter route (DAMM v2 is indexed by Jupiter).
   */
  async planTrade(token: TokenRef, side: 'BUY' | 'SELL', amountUi: string, payWith: PayWith, slippageBps: number, maxAccounts?: number, direct = false): Promise<Plan & { jupiterTx?: (owner: PublicKey) => Promise<BuiltTransaction> }> {
    const inAsset = side === 'BUY' ? payWith : 'TOKEN'
    const amount = toRaw(amountUi, this.dec(inAsset))
    if (amount <= 0n) throw new HttpError(400, 'amount must be positive')
    const quoteMint = this.quoteMint.toBase58()

    if (token.status === 'MIGRATED') {
      const other = payWith === 'SOL' ? WSOL : quoteMint
      const q = await this.jup.quote({
        inputMint: side === 'BUY' ? other : token.mint,
        outputMint: side === 'BUY' ? token.mint : other,
        amount,
        slippageBps,
        capAccounts: false,
        direct,
      })
      const outDec = this.dec(side === 'BUY' ? 'TOKEN' : payWith)
      const quote: TradeQuote = {
        inAmount: toUi(amount, this.dec(inAsset)),
        outAmount: toUi(BigInt(q.outAmount), outDec),
        minOut: toUi(BigInt(q.otherAmountThreshold), outDec),
        feeQuote: '0',
        priceImpactPct: Number(q.priceImpactPct) * 100,
        route: `Jupiter (${q.routePlan.map((r) => r.swapInfo.label ?? '?').join(' > ')})`,
      }
      return {
        quote,
        build: async () => {
          throw new HttpError(500, 'use jupiterTx')
        },
        jupiterTx: async (owner) => {
          const { swapTransaction, lastValidBlockHeight } = await this.jup.swapTransaction(q, owner.toBase58())
          return { transaction: swapTransaction, lastValidBlockHeight, quote }
        },
      }
    }

    if (token.status === 'COMPLETE') throw new HttpError(409, 'the curve is complete and graduating; trading resumes on DAMM v2 shortly')

    const pool = token.pool
    if (side === 'BUY') {
      let quoteIn = amount
      let jupQ: JupQuote | null = null
      if (payWith === 'SOL') {
        jupQ = await this.jup.quote({ inputMint: WSOL, outputMint: quoteMint, amount, slippageBps, capAccounts: true, maxAccounts, direct })
        // Spend only what Jupiter guarantees; any excess stays in the user's quote account.
        quoteIn = BigInt(jupQ.otherAmountThreshold)
      }
      const d = await this.dbcQuote(pool, false, quoteIn, slippageBps).catch((err: unknown) => {
        // A buy larger than what is left on the curve: fill the curve exactly
        // (this completes it and triggers graduation); unused quote is refunded.
        if (err instanceof HttpError && /not enough liquidity/.test(err.message)) return this.dbcQuote(pool, false, quoteIn, slippageBps, true)
        throw err
      })
      return {
        quote: {
          inAmount: d.partial ? toUi(d.used, this.env.QUOTE_DECIMALS) : toUi(amount, this.dec(payWith)),
          outAmount: toUi(d.out, TOKEN_DECIMALS),
          minOut: toUi(d.minOut, TOKEN_DECIMALS),
          feeQuote: toUi(d.fee, this.env.QUOTE_DECIMALS),
          priceImpactPct: jupQ ? Number(jupQ.priceImpactPct) * 100 : null,
          route: `${jupQ ? `SOL > ${this.env.QUOTE_SYMBOL} (Jupiter) > ` : ''}Meteora DBC${d.partial ? ' (fills the curve; unused amount stays in your wallet)' : ''}`,
        },
        build: async (owner) => {
          const ixs: TransactionInstruction[] = []
          const alts: string[] = []
          if (jupQ) {
            const j = await this.jup.swapInstructions(jupQ, owner.toBase58())
            ixs.push(...j.setupInstructions.map(toIx), toIx(j.swapInstruction), ...(j.cleanupInstruction ? [toIx(j.cleanupInstruction)] : []))
            alts.push(...j.addressLookupTableAddresses)
          }
          ixs.push(...(await this.swapIxs(owner, pool, false, quoteIn, d.minOut, d.partial)))
          return { ixs, alts }
        },
      }
    }

    // SELL
    const d = await this.dbcQuote(pool, true, amount, slippageBps)
    let jupQ: JupQuote | null = null
    if (payWith === 'SOL') {
      jupQ = await this.jup.quote({ inputMint: quoteMint, outputMint: WSOL, amount: d.minOut, slippageBps, capAccounts: true, maxAccounts, direct })
    }
    const outDec = this.dec(payWith)
    return {
      quote: {
        inAmount: toUi(amount, TOKEN_DECIMALS),
        outAmount: toUi(jupQ ? BigInt(jupQ.outAmount) : d.out, outDec),
        minOut: toUi(jupQ ? BigInt(jupQ.otherAmountThreshold) : d.minOut, outDec),
        feeQuote: toUi(d.fee, this.env.QUOTE_DECIMALS),
        priceImpactPct: jupQ ? Number(jupQ.priceImpactPct) * 100 : null,
        route: jupQ ? `Meteora DBC > ${this.env.QUOTE_SYMBOL} > SOL (Jupiter)` : 'Meteora DBC',
      },
      build: async (owner) => {
        const ixs = await this.swapIxs(owner, pool, true, amount, d.minOut)
        const alts: string[] = []
        if (jupQ) {
          const j = await this.jup.swapInstructions(jupQ, owner.toBase58())
          ixs.push(...j.setupInstructions.map(toIx), toIx(j.swapInstruction), ...(j.cleanupInstruction ? [toIx(j.cleanupInstruction)] : []))
          alts.push(...j.addressLookupTableAddresses)
        }
        return { ixs, alts }
      },
    }
  }

  private async swapIxs(owner: PublicKey, pool: string, swapBaseForQuote: boolean, amountIn: bigint, minOut: bigint, partial = false): Promise<TransactionInstruction[]> {
    const tx = await this.dbc.pool.swap2({
      owner,
      payer: owner,
      pool: new PublicKey(pool),
      swapBaseForQuote,
      referralTokenAccount: null,
      swapMode: (partial ? SwapMode.PartialFill : SwapMode.ExactIn) as SwapMode.ExactIn,
      amountIn: new BN(amountIn.toString()),
      minimumAmountOut: new BN(minOut.toString()),
    })
    return tx.instructions
  }

  async buildTrade(token: TokenRef, owner: PublicKey, side: 'BUY' | 'SELL', amountUi: string, payWith: PayWith, slippageBps: number): Promise<BuiltTransaction> {
    try {
      return await this.buildTradeOnce(token, owner, side, amountUi, payWith, slippageBps)
    } catch (err) {
      // A quote from pool state one trade behind what the simulator sees
      // (a launch or buy that just landed) trips the slippage check. Re-read
      // the pool and rebuild once; a second failure is a real price move.
      if (!(err instanceof HttpError && err.status === 422 && /slippage/.test(err.message))) throw err
      this.poolCache.delete(token.pool)
      await new Promise((r) => setTimeout(r, 800))
      return this.buildTradeOnce(token, owner, side, amountUi, payWith, slippageBps)
    }
  }

  private async buildTradeOnce(token: TokenRef, owner: PublicKey, side: 'BUY' | 'SELL', amountUi: string, payWith: PayWith, slippageBps: number): Promise<BuiltTransaction> {
    const usesJupiter = payWith === 'SOL' || token.status === 'MIGRATED'
    const attempts: { cap?: number; direct: boolean }[] = usesJupiter
      ? [{ cap: this.env.JUPITER_MAX_ACCOUNTS, direct: false }, { cap: 20, direct: false }, { cap: this.env.JUPITER_MAX_ACCOUNTS, direct: true }]
      : [{ direct: false }]
    let lastErr: unknown
    for (const { cap, direct } of attempts) {
      try {
        const plan = await this.planTrade(token, side, amountUi, payWith, slippageBps, cap, direct)
        if (plan.jupiterTx) return plan.jupiterTx(owner)
        const { ixs, alts } = await plan.build(owner)
        return { ...(await this.compile(owner, ixs, alts, 500_000)), quote: plan.quote }
      } catch (err) {
        lastErr = err
        const retry = (err instanceof HttpError && err.status === 422 && /too large/.test(err.message)) || isRouteSpecificFailure(err)
        if (!retry || !usesJupiter) throw err
      }
    }
    if (payWith !== 'SOL' || token.status !== 'CURVE') throw lastErr
    try {
      return await this.buildTradeSplit(token, owner, side, amountUi, slippageBps, false)
    } catch (err) {
      if (!isRouteSpecificFailure(err)) throw err
      return this.buildTradeSplit(token, owner, side, amountUi, slippageBps, true)
    }
  }

  /**
   * SOL leg in its own transaction, signed together with the DBC swap and
   * sent first (BuiltTransaction.preTransactions). Buys: SOL -> quote via
   * Jupiter, then the DBC buy spending exactly what Jupiter guarantees.
   * Sells: the DBC sell, then quote -> SOL for exactly the sell's minimum.
   */
  private async buildTradeSplit(token: TokenRef, owner: PublicKey, side: 'BUY' | 'SELL', amountUi: string, slippageBps: number, direct: boolean): Promise<BuiltTransaction> {
    const quoteMint = this.quoteMint.toBase58()
    if (side === 'BUY') {
      const amount = toRaw(amountUi, SOL_DECIMALS)
      const jq = await this.jup.quote({ inputMint: WSOL, outputMint: quoteMint, amount, slippageBps, capAccounts: false, direct })
      const quoteIn = BigInt(jq.otherAmountThreshold)
      const d = await this.dbcQuote(token.pool, false, quoteIn, slippageBps)
      const pre = await this.jup.swapTransaction(jq, owner.toBase58())
      // Cannot simulate before the swap lands: the owner does not hold the quote yet.
      const main = await this.compile(owner, await this.swapIxs(owner, token.pool, false, quoteIn, d.minOut), [], 300_000, false)
      return {
        ...main,
        preTransactions: [pre.swapTransaction],
        quote: {
          inAmount: amountUi,
          outAmount: toUi(d.out, TOKEN_DECIMALS),
          minOut: toUi(d.minOut, TOKEN_DECIMALS),
          feeQuote: toUi(d.fee, this.env.QUOTE_DECIMALS),
          priceImpactPct: Number(jq.priceImpactPct) * 100,
          route: `SOL > ${this.env.QUOTE_SYMBOL} (Jupiter), then Meteora DBC`,
        },
      }
    }
    const amount = toRaw(amountUi, TOKEN_DECIMALS)
    const d = await this.dbcQuote(token.pool, true, amount, slippageBps)
    const pre = await this.compile(owner, await this.swapIxs(owner, token.pool, true, amount, d.minOut), [], 300_000)
    const jq = await this.jup.quote({ inputMint: quoteMint, outputMint: WSOL, amount: d.minOut, slippageBps, capAccounts: false, direct })
    const main = await this.jup.swapTransaction(jq, owner.toBase58())
    return {
      preTransactions: [pre.transaction],
      transaction: main.swapTransaction,
      lastValidBlockHeight: main.lastValidBlockHeight,
      quote: {
        inAmount: amountUi,
        outAmount: toUi(BigInt(jq.outAmount), SOL_DECIMALS),
        minOut: toUi(BigInt(jq.otherAmountThreshold), SOL_DECIMALS),
        feeQuote: toUi(d.fee, this.env.QUOTE_DECIMALS),
        priceImpactPct: Number(jq.priceImpactPct) * 100,
        route: `Meteora DBC, then ${this.env.QUOTE_SYMBOL} > SOL (Jupiter)`,
      },
    }
  }


  async accountExists(key: PublicKey): Promise<boolean> {
    return !!(await this.connection.getAccountInfo(key))
  }

  /* ------------------------------- launch ------------------------------- */

  async buildLaunch(p: {
    creator: PublicKey
    mint: PublicKey
    /** When the server holds the mint keypair (vanity pool), it signs here. */
    mintSigner?: Keypair
    name: string
    symbol: string
    uri: string
    firstBuy?: { amount: string; payWith: PayWith; slippageBps: number }
  }): Promise<BuiltTransaction> {
    if (await this.connection.getAccountInfo(p.mint)) throw new HttpError(409, 'that mint address is already in use; generate a new one')
    const createPoolParam = {
      name: p.name,
      symbol: p.symbol,
      uri: p.uri,
      payer: p.creator,
      poolCreator: p.creator,
      config: this.config,
      baseMint: p.mint,
    }
    const ixs: TransactionInstruction[] = []
    const alts: string[] = []

    if (!p.firstBuy || toRaw(p.firstBuy.amount || '0', this.dec(p.firstBuy.payWith)) === 0n) {
      ixs.push(...(await this.dbc.creator.createPool(createPoolParam)).instructions)
      return { ...(await this.compile(p.creator, ixs, alts, 700_000, true, p.mintSigner)), quote: null }
    }

    const { payWith, slippageBps } = p.firstBuy
    const amount = toRaw(p.firstBuy.amount, this.dec(payWith))
    // Pool creation + metadata + first buy is already a large transaction; a
    // Jupiter leg on top only fits with a short route. Tighten the route cap
    // until it fits rather than failing the launch.
    const caps: { cap: number; direct: boolean }[] =
      payWith === 'SOL'
        ? [{ cap: this.env.JUPITER_MAX_ACCOUNTS, direct: false }, { cap: 20, direct: false }, { cap: this.env.JUPITER_MAX_ACCOUNTS, direct: true }]
        : [{ cap: 0, direct: false }]
    let lastErr: unknown
    for (const { cap, direct } of caps) {
      const legIxs: TransactionInstruction[] = []
      const legAlts: string[] = []
      let quoteIn = amount
      if (payWith === 'SOL') {
        const jq = await this.jup.quote({ inputMint: WSOL, outputMint: this.quoteMint.toBase58(), amount, slippageBps, capAccounts: true, maxAccounts: cap, direct }).catch((err: unknown) => {
          lastErr = err
          return null
        })
        if (!jq) continue
        quoteIn = BigInt(jq.otherAmountThreshold)
        const j = await this.jup.swapInstructions(jq, p.creator.toBase58()).catch((err: unknown) => {
          lastErr = err
          return null
        })
        if (!j) continue
        legIxs.push(...j.setupInstructions.map(toIx), toIx(j.swapInstruction), ...(j.cleanupInstruction ? [toIx(j.cleanupInstruction)] : []))
        legAlts.push(...j.addressLookupTableAddresses)
      }
      const d = await this.dbcQuote(null, false, quoteIn, slippageBps)
      const tx = await this.dbc.creator.createPoolWithFirstBuy({
        createPoolParam,
        firstBuyParam: {
          buyer: p.creator,
          receiver: p.creator,
          buyAmount: new BN(quoteIn.toString()),
          minimumAmountOut: new BN(d.minOut.toString()),
          referralTokenAccount: null,
        },
      })
      const quote: TradeQuote = {
        inAmount: p.firstBuy.amount,
        outAmount: toUi(d.out, TOKEN_DECIMALS),
        minOut: toUi(d.minOut, TOKEN_DECIMALS),
        feeQuote: toUi(d.fee, this.env.QUOTE_DECIMALS),
        priceImpactPct: null,
        route: payWith === 'SOL' ? `SOL > ${this.env.QUOTE_SYMBOL} (Jupiter) > Meteora DBC` : 'Meteora DBC',
      }
      try {
        // The mint keypair signs client-side; simulation runs with signature checks off.
        return { ...(await this.compile(p.creator, [...legIxs, ...tx.instructions], legAlts, 900_000, true, p.mintSigner)), quote }
      } catch (err) {
        lastErr = err
        if (!(err instanceof HttpError) || err.status !== 422 || !/too large/.test(err.message)) throw err
      }
    }
    if (payWith !== 'SOL') throw lastErr

    // Two transactions, signed together: a full Jupiter SOL -> quote swap,
    // then the atomic create + first buy spending exactly what the swap
    // guarantees. The create cannot be simulated before the swap lands (the
    // creator does not hold the quote yet), so only its size is checked here.
    const splitLeg = async (direct: boolean) => {
      const jq = await this.jup.quote({ inputMint: WSOL, outputMint: this.quoteMint.toBase58(), amount, slippageBps, capAccounts: false, direct })
      return { jq, pre: await this.jup.swapTransaction(jq, p.creator.toBase58()) }
    }
    const { jq, pre } = await splitLeg(false).catch((err: unknown) => {
      if (!isRouteSpecificFailure(err)) throw err
      return splitLeg(true)
    })
    const quoteIn = BigInt(jq.otherAmountThreshold)
    const d = await this.dbcQuote(null, false, quoteIn, slippageBps)
    const create = await this.dbc.creator.createPoolWithFirstBuy({
      createPoolParam,
      firstBuyParam: {
        buyer: p.creator,
        receiver: p.creator,
        buyAmount: new BN(quoteIn.toString()),
        minimumAmountOut: new BN(d.minOut.toString()),
        referralTokenAccount: null,
      },
    })
    const main = await this.compile(p.creator, create.instructions, [], 900_000, false, p.mintSigner)
    return {
      ...main,
      preTransactions: [pre.swapTransaction],
      quote: {
        inAmount: p.firstBuy.amount,
        outAmount: toUi(d.out, TOKEN_DECIMALS),
        minOut: toUi(d.minOut, TOKEN_DECIMALS),
        feeQuote: toUi(d.fee, this.env.QUOTE_DECIMALS),
        priceImpactPct: Number(jq.priceImpactPct) * 100,
        route: `SOL > ${this.env.QUOTE_SYMBOL} (Jupiter), then Meteora DBC`,
      },
    }
  }

  /* ----------------------------- assembly ----------------------------- */

  /**
   * One v0 transaction: our compute budget, the SDK/Jupiter instructions with
   * their own budget ixs removed (only one of each is allowed), and every
   * create-ATA forced idempotent and de-duplicated (Jupiter and the DBC SDK
   * both open the same accounts). Simulated before it is returned so the
   * user sees a real error instead of a failed wallet prompt.
   */
  private async compile(
    payer: PublicKey,
    raw: TransactionInstruction[],
    altAddrs: string[],
    cu: number,
    simulate = true,
    partialSigner?: Keypair,
  ): Promise<Omit<BuiltTransaction, 'quote'>> {
    const seenAta = new Set<string>()
    const ixs: TransactionInstruction[] = []
    for (const ix of raw) {
      const pid = ix.programId.toBase58()
      if (pid === COMPUTE_BUDGET) continue
      if (ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
        const ata = ix.keys[1]?.pubkey.toBase58() ?? ''
        if (seenAta.has(ata)) continue
        seenAta.add(ata)
        ix.data = Buffer.from([1]) // CreateIdempotent
      }
      ixs.push(ix)
    }

    const alts: AddressLookupTableAccount[] = []
    for (const a of [...new Set(altAddrs)]) {
      const r = await this.connection.getAddressLookupTable(new PublicKey(a))
      if (r.value) alts.push(r.value)
    }

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed')
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: cu }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.env.PRIORITY_FEE_MICROLAMPORTS }),
        ...ixs,
      ],
    }).compileToV0Message(alts)
    const tx = new VersionedTransaction(message)

    let size: number
    try {
      size = tx.serialize().length
    } catch {
      size = Infinity
    }
    if (size > MAX_TX_BYTES) throw new HttpError(422, 'route too large for one transaction; try paying with the quote token directly')

    const sim = simulate ? await this.connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true }) : null
    if (sim?.value.err) {
      const logs = sim.value.logs ?? []
      throw new HttpError(422, simulationMessage(logs, sim.value.err), { logs: logs.slice(-8) })
    }
    // Partial signature for a server-held mint; the wallet adds the payer's.
    if (partialSigner) tx.sign([partialSigner])
    return { transaction: Buffer.from(tx.serialize()).toString('base64'), lastValidBlockHeight }
  }
}

function simulationMessage(logs: string[], err: unknown): string {
  const text = logs.join('\n')
  if (JSON.stringify(err).includes('AccountNotFound')) return 'your wallet needs some SOL to pay network fees'
  if (/insufficient lamports|insufficient funds/i.test(text)) return 'insufficient balance for this trade plus fees'
  if (/ExceededSlippage|SlippageToleranceExceeded|0x1771/i.test(text)) return 'price moved beyond your slippage; try again or raise slippage'
  if (/PoolIsCompleted|pool is completed/i.test(text)) return 'the curve just completed; trading resumes after graduation'
  const custom = /custom program error: (0x[0-9a-f]+)/i.exec(text)?.[1]
  return `transaction would fail${custom ? ` (${custom})` : ''}: ${JSON.stringify(err)}`
}
