import type { PoolConfig } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { Prisma, type PrismaClient, type Token, retireVanityMint, toTokenDTO, toTradeDTO } from '@hpos-pad/db'
import { TIMEFRAMES, TIMEFRAME_SECONDS, TOKEN_DECIMALS, TOKEN_TOTAL_SUPPLY, priceFromSqrtPrice } from '@hpos-pad/shared'
import type { Redis } from 'ioredis'
import type pino from 'pino'
import { publishEvent } from '../clients/redis.js'
import type { Solana } from '../clients/solana.js'
import { type ChainEventDecoded, type DammSwapEvent, type DbcInitEvent, type DbcSwapEvent, decodeEvents } from '../ingestion/decode.js'
import type { NormalizedTx } from '../ingestion/types.js'
import { fetchTokenMeta } from './metadata.js'

type Deps = {
  prisma: PrismaClient
  redis: Redis
  solana: Solana
  logger: pino.Logger
  quoteDecimals: number
  /** Called when a token graduates, so the live source starts watching its DAMM pool. */
  onWatch: (address: string) => void
}

const seqOf = (slot: number, eventIndex: number): bigint => BigInt(slot) * 1000n + BigInt(eventIndex)

export class Processor {
  private poolConfig: PoolConfig | null = null
  private readonly dammPools = new Map<string, string>() // dammPool -> mint
  private readonly dbcPools = new Map<string, string>() // dbc pool -> mint

  constructor(private readonly d: Deps) {}

  async init(): Promise<void> {
    this.poolConfig = await this.d.solana.dbc.state.getPoolConfig(this.d.solana.config)
    if (!this.poolConfig) throw new Error(`DBC config ${this.d.solana.config.toBase58()} not found on chain`)
    const tokens = await this.d.prisma.token.findMany({ select: { mint: true, pool: true, dammPool: true } })
    for (const t of tokens) {
      this.dbcPools.set(t.pool, t.mint)
      if (t.dammPool) this.dammPools.set(t.dammPool, t.mint)
    }
  }

  /** Addresses whose transactions the ingestion sources must see. */
  watchedAddresses(): string[] {
    return [this.d.solana.config.toBase58(), ...this.dammPools.keys()]
  }

  /** A token graduated (service wrote dammPool): start indexing its DAMM v2 trades. */
  registerDammPool(dammPool: string, mint: string): void {
    if (this.dammPools.has(dammPool)) return
    this.dammPools.set(dammPool, mint)
    this.d.onWatch(dammPool)
  }

  async handle(tx: NormalizedTx): Promise<void> {
    const events = decodeEvents(tx)
    if (events.length === 0) return
    const config = this.d.solana.config.toBase58()
    const blockTime = tx.blockTime ?? new Date()
    const trader = tx.accountKeys[0]!

    for (const ev of events) {
      try {
        if (ev.kind === 'dbc_init' && ev.config === config) await this.onInit(ev, tx, blockTime)
        else if (ev.kind === 'dbc_swap' && ev.config === config) await this.onDbcSwap(ev, tx, blockTime, trader)
        else if (ev.kind === 'dbc_curve_complete' && ev.config === config) await this.onCurveComplete(ev.pool)
        else if (ev.kind === 'damm_swap' && this.dammPools.has(ev.pool)) await this.onDammSwap(ev, tx, blockTime, trader)
      } catch (err) {
        this.d.logger.error({ err: (err as Error).message, sig: tx.signature, kind: ev.kind }, 'event failed')
        throw err
      }
    }
  }

  /* ---------------------------------------------------------------- */

  private initialPrice(): number {
    return priceFromSqrtPrice(this.poolConfig!.sqrtStartPrice.toString(), TOKEN_DECIMALS, this.d.quoteDecimals)
  }

  private async onInit(ev: DbcInitEvent & { eventIndex: number }, tx: NormalizedTx, blockTime: Date): Promise<void> {
    if (await this.d.prisma.token.findUnique({ where: { mint: ev.baseMint }, select: { mint: true } })) return
    await this.createToken(ev.baseMint, ev.pool, ev.creator, tx.signature, blockTime)
  }

  /** Create from a draft if the creator used our UI, otherwise from on-chain metadata. */
  private async createToken(mint: string, pool: string, creator: string, signature: string, createdAt: Date): Promise<Token> {
    const draft = await this.d.prisma.launchDraft.findUnique({ where: { mint } })
    const onchain = await fetchTokenMeta(this.d.solana.connection, mint)
    const price = this.initialPrice()
    const token = await this.d.prisma.token.upsert({
      where: { mint },
      update: {},
      create: {
        mint,
        pool,
        config: this.d.solana.config.toBase58(),
        creator,
        // On-chain name/symbol are what wallets show; never let a draft disagree.
        name: onchain?.name || draft?.name || 'Unknown',
        symbol: onchain?.symbol || draft?.symbol || '???',
        uri: onchain?.uri || draft?.uri || '',
        description: draft?.description ?? onchain?.description ?? null,
        imageUrl: draft?.imageUrl ?? onchain?.imageUrl ?? null,
        website: draft?.website ?? onchain?.website ?? null,
        twitter: draft?.twitter ?? onchain?.twitter ?? null,
        telegram: draft?.telegram ?? onchain?.telegram ?? null,
        createdAt,
        createdSignature: signature,
        priceQuote: price,
        marketCapQuote: price * TOKEN_TOTAL_SUPPLY,
        migrationThreshold: new Prisma.Decimal(this.poolConfig!.migrationQuoteThreshold.toString()),
      },
    })
    this.dbcPools.set(pool, mint)
    await retireVanityMint(this.d.prisma, mint)
    publishEvent(this.d.redis, { type: 'token:new', token: toTokenDTO(token, this.dec(), await this.quoteUsd()) })
    this.d.logger.info({ mint, symbol: token.symbol }, 'token created')
    return token
  }

  private async tokenForDbcPool(pool: string, tx: NormalizedTx, blockTime: Date): Promise<Token | null> {
    const mint = this.dbcPools.get(pool)
    if (mint) return this.d.prisma.token.findUnique({ where: { mint } })
    // The pool's init predates our backfill window: reconstruct from chain.
    const state = (await this.d.solana.dbc.state.getPool(pool))?.poolState
    if (!state || state.config.toBase58() !== this.d.solana.config.toBase58()) return null
    return this.createToken(state.baseMint.toBase58(), pool, state.creator.toBase58(), tx.signature, blockTime)
  }

  private async onDbcSwap(ev: DbcSwapEvent & { eventIndex: number }, tx: NormalizedTx, blockTime: Date, trader: string): Promise<void> {
    const token = await this.tokenForDbcPool(ev.pool, tx, blockTime)
    if (!token) return
    const buy = ev.direction === 1
    // QuoteToken fee mode: buys pay the fee out of the quote input, sells out of the quote output.
    const baseAmount = buy ? ev.outputAmount : ev.inputAmount
    const quoteAmount = buy ? ev.inputAmount : ev.outputAmount
    const price = priceFromSqrtPrice(ev.nextSqrtPrice, TOKEN_DECIMALS, this.d.quoteDecimals)
    await this.recordTrade(token, {
      signature: tx.signature,
      eventIndex: ev.eventIndex,
      slot: tx.slot,
      blockTime,
      trader,
      side: buy ? 'BUY' : 'SELL',
      venue: 'DBC',
      baseAmount,
      quoteAmount,
      feeQuote: ev.feeTotal,
      price,
      quoteReserve: ev.quoteReserve,
      migrationThreshold: ev.migrationThreshold,
    })
  }

  private async onDammSwap(ev: DammSwapEvent & { eventIndex: number }, tx: NormalizedTx, blockTime: Date, trader: string): Promise<void> {
    const mint = this.dammPools.get(ev.pool)!
    const token = await this.d.prisma.token.findUnique({ where: { mint } })
    if (!token) return
    const baseIsA = token.dammBaseIsA
    // direction 0 = A -> B. The token is bought when the trader receives base.
    const buy = baseIsA ? ev.direction === 1 : ev.direction === 0
    const baseAmount = buy ? ev.outputAmount : ev.inputAmount
    const quoteAmount = buy ? ev.inputAmount : ev.outputAmount
    // DAMM stores sqrt(B per A).
    const pAperB = priceFromSqrtPrice(ev.nextSqrtPrice, baseIsA ? TOKEN_DECIMALS : this.d.quoteDecimals, baseIsA ? this.d.quoteDecimals : TOKEN_DECIMALS)
    const price = baseIsA ? pAperB : 1 / pAperB
    await this.recordTrade(token, {
      signature: tx.signature,
      eventIndex: ev.eventIndex,
      slot: tx.slot,
      blockTime,
      trader,
      side: buy ? 'BUY' : 'SELL',
      venue: 'DAMM_V2',
      baseAmount,
      quoteAmount,
      feeQuote: ev.feeTotal,
      price,
      quoteReserve: baseIsA ? ev.reserveB : ev.reserveA,
      migrationThreshold: null,
    })
  }

  private async onCurveComplete(pool: string): Promise<void> {
    const mint = this.dbcPools.get(pool)
    if (!mint) return
    const token = await this.d.prisma.token.update({ where: { mint }, data: { status: 'COMPLETE' } })
    publishEvent(this.d.redis, { type: 'token:update', token: toTokenDTO(token, this.dec(), await this.quoteUsd()) })
    this.d.logger.info({ mint }, 'curve complete — migrator will graduate it')
  }

  /* ---------------------------------------------------------------- */

  private async recordTrade(
    token: Token,
    t: {
      signature: string
      eventIndex: number
      slot: number
      blockTime: Date
      trader: string
      side: 'BUY' | 'SELL'
      venue: 'DBC' | 'DAMM_V2'
      baseAmount: bigint
      quoteAmount: bigint
      feeQuote: bigint
      price: number
      quoteReserve: bigint
      migrationThreshold: bigint | null
    },
  ): Promise<void> {
    const seq = seqOf(t.slot, t.eventIndex)
    const inserted = await this.d.prisma.trade.createMany({
      data: [
        {
          signature: t.signature,
          eventIndex: t.eventIndex,
          mint: token.mint,
          trader: t.trader,
          side: t.side,
          venue: t.venue,
          baseAmount: new Prisma.Decimal(t.baseAmount.toString()),
          quoteAmount: new Prisma.Decimal(t.quoteAmount.toString()),
          feeQuote: new Prisma.Decimal(t.feeQuote.toString()),
          priceQuote: t.price,
          slot: BigInt(t.slot),
          blockTime: t.blockTime,
        },
      ],
      skipDuplicates: true,
    })
    // Already indexed (live + backfill overlap): nothing else may change.
    if (inserted.count === 0) return

    await this.upsertCandles(token.mint, t.blockTime, t.price, t.quoteAmount, seq)

    const mcap = t.price * TOKEN_TOTAL_SUPPLY
    // Only a newer trade may move the live price; an older backfilled one must not.
    await this.d.prisma.$executeRaw`
      UPDATE "Token" SET
        "priceQuote"        = CASE WHEN ${seq} > "lastTradeSeq" THEN ${t.price} ELSE "priceQuote" END,
        "marketCapQuote"    = CASE WHEN ${seq} > "lastTradeSeq" THEN ${mcap} ELSE "marketCapQuote" END,
        "quoteReserve"      = CASE WHEN ${seq} > "lastTradeSeq" THEN ${new Prisma.Decimal(t.quoteReserve.toString())} ELSE "quoteReserve" END,
        "migrationThreshold"= CASE WHEN ${seq} > "lastTradeSeq" AND ${t.migrationThreshold !== null} THEN ${new Prisma.Decimal((t.migrationThreshold ?? 0n).toString())} ELSE "migrationThreshold" END,
        "lastTradeAt"       = GREATEST(COALESCE("lastTradeAt", ${t.blockTime}), ${t.blockTime}),
        "lastTradeSeq"      = GREATEST("lastTradeSeq", ${seq}),
        "athMarketCapQuote" = GREATEST("athMarketCapQuote", ${mcap}),
        "updatedAt"         = NOW()
      WHERE "mint" = ${token.mint}`

    const [fresh, trade] = await Promise.all([
      this.d.prisma.token.findUniqueOrThrow({ where: { mint: token.mint } }),
      this.d.prisma.trade.findUniqueOrThrow({ where: { signature_eventIndex: { signature: t.signature, eventIndex: t.eventIndex } } }),
    ])
    const usd = await this.quoteUsd()
    const dto = toTokenDTO(fresh, this.dec(), usd)
    publishEvent(this.d.redis, {
      type: 'trade',
      trade: toTradeDTO(trade, fresh, this.dec(), usd),
      token: { mint: dto.mint, symbol: dto.symbol, imageUrl: dto.imageUrl, priceQuote: dto.priceQuote, marketCapQuote: dto.marketCapQuote, progress: dto.progress, status: dto.status },
    })
  }

  private async upsertCandles(mint: string, at: Date, price: number, quoteAmount: bigint, seq: bigint): Promise<void> {
    const vol = new Prisma.Decimal(quoteAmount.toString())
    const unix = Math.floor(at.getTime() / 1000)
    for (const tf of TIMEFRAMES) {
      const size = TIMEFRAME_SECONDS[tf]
      const bucket = new Date(Math.floor(unix / size) * size * 1000)
      await this.d.prisma.$executeRaw`
        INSERT INTO "Candle" ("mint","timeframe","bucket","open","high","low","close","volumeQuote","trades","openSeq","closeSeq")
        VALUES (${mint}, ${tf}, ${bucket}, ${price}, ${price}, ${price}, ${price}, ${vol}, 1, ${seq}, ${seq})
        ON CONFLICT ("mint","timeframe","bucket") DO UPDATE SET
          "open"        = CASE WHEN EXCLUDED."openSeq" < "Candle"."openSeq" THEN EXCLUDED."open" ELSE "Candle"."open" END,
          "openSeq"     = LEAST("Candle"."openSeq", EXCLUDED."openSeq"),
          "close"       = CASE WHEN EXCLUDED."closeSeq" > "Candle"."closeSeq" THEN EXCLUDED."close" ELSE "Candle"."close" END,
          "closeSeq"    = GREATEST("Candle"."closeSeq", EXCLUDED."closeSeq"),
          "high"        = GREATEST("Candle"."high", EXCLUDED."high"),
          "low"         = LEAST("Candle"."low", EXCLUDED."low"),
          "volumeQuote" = "Candle"."volumeQuote" + EXCLUDED."volumeQuote",
          "trades"      = "Candle"."trades" + 1`
    }
  }

  private dec() {
    return { base: TOKEN_DECIMALS, quote: this.d.quoteDecimals }
  }

  private usdCache: { at: number; v: number | null } = { at: 0, v: null }
  private async quoteUsd(): Promise<number | null> {
    if (Date.now() - this.usdCache.at < 15_000) return this.usdCache.v
    const v = await this.d.redis.get('quote:usd').catch(() => null)
    this.usdCache = { at: Date.now(), v: v ? Number(v) : null }
    return this.usdCache.v
  }
}

export type { ChainEventDecoded }
