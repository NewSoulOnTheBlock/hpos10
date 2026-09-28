import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

/**
 * Load the monorepo-root .env (then an app-local one) into process.env
 * without overwriting variables the deployment already set. In containers
 * the orchestrator's env wins; locally the file fills in the rest.
 */
for (const p of [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')]) {
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || line.trimStart().startsWith('#')) continue
    const [, k, v] = m as unknown as [string, string, string]
    if (process.env[k] === undefined && v !== '') process.env[k] = v.replace(/^(['"])(.*)\1$/, '$2')
  }
}

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true')

const base = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  CLUSTER: z.enum(['mainnet-beta', 'devnet']).default('mainnet-beta'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RPC_URL: z.string().url(),
  /** Optional dedicated websocket endpoint; derived from RPC_URL otherwise. */
  RPC_WS_URL: z.string().url().optional(),

  DBC_CONFIG: z.string().min(32),
  QUOTE_MINT: z.string().min(32),
  QUOTE_SYMBOL: z.string().default('HPOS10I'),
  QUOTE_DECIMALS: z.coerce.number().int().min(0).max(12),
  TRADE_FEE_BPS: z.coerce.number().int().default(160),
  REFLECTION_BPS: z.coerce.number().int().default(0),
  /** Share of volume paid to each token's creator, in bps. */
  CREATOR_BPS: z.coerce.number().int().default(75),
  /** Life watch (jobs/vitals.ts): when a token counts as RUGGED or DEAD. */
  RUG_CREATOR_SOLD_BPS: z.coerce.number().int().default(5_000),
  RUG_MIN_HOLDERS: z.coerce.number().int().default(15),
  RUG_MIN_PEAK_VOLUME_USD: z.coerce.number().default(8_000),
  RUG_IDLE_HOURS: z.coerce.number().default(6),
  RUG_ATH_DRAWDOWN_BPS: z.coerce.number().int().default(7_000),
  DEAD_IDLE_HOURS: z.coerce.number().default(24),
  VITALS_MINUTES: z.coerce.number().default(5),
})

export const indexerEnvSchema = base.extend({
  /** Yellowstone gRPC (Helius LaserStream / Triton). Unset = RPC websocket + polling. */
  GRPC_URL: z.string().url().optional(),
  GRPC_TOKEN: z.string().optional(),
  /** How far back a cold start backfills, in signatures per watched address. */
  BACKFILL_MAX_SIGNATURES: z.coerce.number().int().default(20_000),
  /** Safety-net poll interval for the RPC source, ms. */
  POLL_INTERVAL_MS: z.coerce.number().int().default(15_000),
})

export const serviceEnvSchema = base.extend({
  /** Partner / fee claimer. Base58 secret key or JSON byte array. Pays for claims, payouts and migrations. */
  FEE_CLAIMER_SECRET_KEY: z.string().min(32),
  /** Receives the platform share of every claim. */
  TREASURY: z.string().min(32),
  PRIORITY_FEE_MICROLAMPORTS: z.coerce.number().int().default(50_000),

  REFLECT_ENABLED: bool.default('true'),
  REFLECT_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(30),
  /** Skip a token's epoch until its claimable fees reach this, in quote UI units. */
  REFLECT_MIN_CLAIM_QUOTE: z.coerce.number().default(200),
  /** Shares below this (quote UI units) roll into the token's carry. */
  REFLECT_MIN_PAYOUT_QUOTE: z.coerce.number().default(10),
  /** Ignore wallets under this share of eligible supply (1 bps = 0.01%). */
  REFLECT_MIN_HOLDING_BPS: z.coerce.number().int().default(1),
  /**
   * Auto-settle accrued balances: holders with a quote-token account get
   * their accrual pushed once it reaches REFLECT_MIN_PAYOUT_QUOTE; holders
   * without one get an account opened (paid in SOL by the fee claimer,
   * ~0.00204 SOL each, theirs to keep) once it reaches REFLECT_ATA_MIN_QUOTE.
   * Off = they withdraw with a claim on the site.
   */
  REFLECT_CREATE_ATAS: bool.default('false'),
  REFLECT_ATA_MIN_QUOTE: z.coerce.number().default(40),
  /** Accounts opened per run, at most. */
  REFLECT_MAX_ATAS_PER_EPOCH: z.coerce.number().int().default(50),
  /** Stop opening accounts while the fee claimer holds less SOL than this (claims and migrations need it). */
  REFLECT_SOL_RESERVE: z.coerce.number().default(0.05),
  REFLECT_TRANSFERS_PER_TX: z.coerce.number().int().min(1).max(20).default(10),
  /** Extra wallets never paid (CEX, team). Comma-separated. */
  REFLECT_EXCLUDE: z.string().default(''),

  /**
   * Gas: when the fee claimer's SOL drops below GAS_MIN_SOL, the platform
   * share is kept in the vault (never holder money) and up to
   * GAS_TOPUP_QUOTE of it is sold for SOL via Jupiter.
   */
  GAS_MIN_SOL: z.coerce.number().default(0.15),
  GAS_TOPUP_QUOTE: z.coerce.number().default(3000),
  JUPITER_API_URL: z.string().url().default('https://lite-api.jup.ag/swap/v1'),
  JUPITER_API_KEY: z.string().optional(),

  MIGRATOR_ENABLED: bool.default('true'),
  /** Internal claim signer (private network only). Unset token = signer off. */
  SIGNER_PORT: z.coerce.number().int().default(3002),
  SIGNER_TOKEN: z.string().min(32).optional(),
  HOLDERS_SYNC_MINUTES: z.coerce.number().int().default(5),
})

export type IndexerEnv = z.infer<typeof indexerEnvSchema>
export type ServiceEnv = z.infer<typeof serviceEnvSchema>

/** `KEY=` in an env file (docker env_file, `set -a; . .env`) arrives as ""; that means unset. */
function definedEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ''))
}

export function loadEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  const parsed = schema.safeParse(definedEnv())
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i: z.ZodIssue) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return parsed.data
}

export function wsUrlFor(env: { RPC_URL: string; RPC_WS_URL?: string }): string {
  return env.RPC_WS_URL ?? env.RPC_URL.replace(/^http/, 'ws')
}
