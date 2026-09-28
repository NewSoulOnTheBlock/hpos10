import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
  validateConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { TOKEN_DECIMALS, TOKEN_TOTAL_SUPPLY, feeSplit } from '@hpos-pad/shared'
import { z } from 'zod'
import { createSolana } from '../clients/solana.js'
import { loadEnv } from '../config/env.js'
import { parseKeypair } from '../lib/keys.js'
import { createSender } from '../lib/tx.js'

/**
 * Create the launchpad's DBC config key. Run once per quote token / fee
 * schedule; every token launched on the pad uses it. Everything here is
 * immutable once created, so it validates locally with the same checks the
 * program runs, and defaults to a dry run.
 *
 *   pnpm config:create            simulate + print
 *   pnpm config:create --send     create it; paste the address into DBC_CONFIG
 */
const env = loadEnv(
  z.object({
    RPC_URL: z.string().url(),
    QUOTE_MINT: z.string(),
    QUOTE_DECIMALS: z.coerce.number().int(),
    QUOTE_SYMBOL: z.string().default('HPOS10I'),
    FEE_CLAIMER_SECRET_KEY: z.string(),
    TRADE_FEE_BPS: z.coerce.number().int().default(160),
    REFLECTION_BPS: z.coerce.number().int().default(0),
    CREATOR_BPS: z.coerce.number().int().default(75),
    /** Market caps are in the QUOTE token, not USD. Required: they depend on the quote price. */
    INITIAL_MCAP_QUOTE: z.coerce.number().positive(),
    MIGRATION_MCAP_QUOTE: z.coerce.number().positive(),
    /** Optional SOL fee to create a pool (10% to Meteora). 0 = free launches. */
    POOL_CREATION_FEE_SOL: z.coerce.number().default(0),
  }),
)
const send = process.argv.includes('--send')

const split = feeSplit({ tradeFeeBps: env.TRADE_FEE_BPS, reflectionBps: env.REFLECTION_BPS, creatorBps: env.CREATOR_BPS })
const partner = parseKeypair(env.FEE_CLAIMER_SECRET_KEY)
const solana = await createSolana({ RPC_URL: env.RPC_URL, DBC_CONFIG: partner.publicKey.toBase58(), QUOTE_MINT: env.QUOTE_MINT })
const configKp = Keypair.generate()

const curve = buildCurveWithMarketCap({
  token: {
    tokenType: TokenType.SPLToken,
    tokenBaseDecimal: TOKEN_DECIMALS as TokenDecimal,
    // TokenDecimal only spells 6..9; quote decimals are a client-side input
    // to the curve math and never go on-chain, so any value is correct here.
    tokenQuoteDecimal: env.QUOTE_DECIMALS as TokenDecimal,
    tokenAuthorityOption: TokenAuthorityOption.Immutable,
    totalTokenSupply: TOKEN_TOTAL_SUPPLY,
    leftover: 0,
  },
  fee: {
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      // Flat: no decaying sniper tax, the same fee from the first block.
      feeSchedulerParam: { startingFeeBps: env.TRADE_FEE_BPS, endingFeeBps: env.TRADE_FEE_BPS, numberOfPeriod: 0, totalDuration: 0 },
    },
    dynamicFeeEnabled: false,
    // Fees in the quote token on buys AND sells: reflections never sell the chart.
    collectFeeMode: CollectFeeMode.QuoteToken,
    // 0: the whole non-protocol fee goes to the partner (the platform fee
    // claimer), which splits it holders/platform. The launching creator is
    // not a fee recipient, so no one outside the ledger can claim holders' share.
    creatorTradingFeePercentage: 0,
    poolCreationFee: env.POOL_CREATION_FEE_SOL,
    enableFirstSwapWithMinFee: false,
  },
  migration: {
    migrationOption: MigrationOption.MET_DAMM_V2,
    migrationFeeOption: MigrationFeeOption.Customizable,
    migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    migratedPoolFee: {
      // Same fee after graduation, still in the quote token, so reflections continue.
      collectFeeMode: MigratedCollectFeeMode.QuoteToken,
      dynamicFee: DammV2DynamicFeeMode.Disabled,
      poolFeeBps: env.TRADE_FEE_BPS,
    },
  },
  liquidityDistribution: {
    // The platform owns 100% of graduated LP, permanently locked: it can never
    // be pulled, and its fees fund post-graduation reflections.
    partnerPermanentLockedLiquidityPercentage: 100,
    partnerLiquidityPercentage: 0,
    creatorPermanentLockedLiquidityPercentage: 0,
    creatorLiquidityPercentage: 0,
  },
  lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
  activationType: ActivationType.Timestamp,
  initialMarketCap: env.INITIAL_MCAP_QUOTE,
  migrationMarketCap: env.MIGRATION_MCAP_QUOTE,
} as never)

validateConfigParameters({ ...curve, leftoverReceiver: partner.publicKey } as never)
const threshold = Number(curve.migrationQuoteThreshold.toString()) / 10 ** env.QUOTE_DECIMALS

console.log('\nThe Hatchery DBC config')
console.log(`  quote            ${env.QUOTE_SYMBOL} ${env.QUOTE_MINT}`)
console.log(`  fee              ${split.tradeFeeBps / 100}%  = ${split.reflectionBps ? `holders ${split.reflectionBps / 100}% + ` : ''}creator ${split.creatorBps / 100}% + platform ${split.platformBps / 100}% + Meteora ${split.protocolBps / 100}%`)
console.log(`  curve            ${env.INITIAL_MCAP_QUOTE.toLocaleString()} -> ${env.MIGRATION_MCAP_QUOTE.toLocaleString()} ${env.QUOTE_SYMBOL} market cap`)
console.log(`  graduates at     ${threshold.toLocaleString()} ${env.QUOTE_SYMBOL} raised`)
console.log(`  partner          ${partner.publicKey.toBase58()}  (fee claimer, leftover receiver, 100% locked LP)`)
console.log(`  config key       ${configKp.publicKey.toBase58()}`)
console.log('  validateConfigParameters: ok')

const tx = await solana.dbc.partner.createConfig({
  config: configKp.publicKey,
  feeClaimer: partner.publicKey,
  leftoverReceiver: partner.publicKey,
  payer: partner.publicKey,
  quoteMint: solana.quoteMint,
  ...curve,
} as never)

if (!send) {
  const { blockhash } = await solana.connection.getLatestBlockhash()
  tx.recentBlockhash = blockhash
  tx.feePayer = partner.publicKey
  tx.sign(partner, configKp)
  const sim = await solana.connection.simulateTransaction(tx)
  if (sim.value.err) {
    console.error('\n  simulation FAILED:', JSON.stringify(sim.value.err))
    console.error((sim.value.logs ?? []).slice(-12).join('\n'))
    process.exit(1)
  }
  console.log(`  simulation ok (${sim.value.unitsConsumed ?? '?'} CU). Re-run with --send to create it.\n`)
  process.exit(0)
}

const sol = (await solana.connection.getBalance(partner.publicKey)) / LAMPORTS_PER_SOL
if (sol < 0.02) throw new Error(`partner holds ${sol} SOL; fund it first`)
const sig = await createSender(solana.connection, 50_000).send(tx.instructions, [partner, configKp])
console.log(`\n  created: https://solscan.io/tx/${sig}`)
console.log(`  set DBC_CONFIG=${configKp.publicKey.toBase58()} in .env\n`)
