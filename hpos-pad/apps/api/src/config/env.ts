import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

// Same convention as apps/chain: the root .env fills gaps, the deployment's env wins.
for (const p of [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')]) {
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || line.trimStart().startsWith('#')) continue
    const [, k, v] = m as unknown as [string, string, string]
    if (process.env[k] === undefined && v !== '') process.env[k] = v.replace(/^(['"])(.*)\1$/, '$2')
  }
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().default(3001),
  CORS_ORIGINS: z.string().default('*'),
  /** Comma-separated mints to feature on the site, mascot first. */
  FEATURED_MINTS: z.string().default(''),
  /** The platform's official token. */
  OFFICIAL_MINT: z.string().optional(),
  CLUSTER: z.enum(['mainnet-beta', 'devnet']).default('mainnet-beta'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  RPC_URL: z.string().url(),

  DBC_CONFIG: z.string().min(32),
  QUOTE_MINT: z.string().min(32),
  QUOTE_SYMBOL: z.string().default('HPOS10I'),
  QUOTE_DECIMALS: z.coerce.number().int(),
  TRADE_FEE_BPS: z.coerce.number().int().default(160),
  REFLECTION_BPS: z.coerce.number().int().default(0),
  CREATOR_BPS: z.coerce.number().int().default(75),
  /** Public keys only; the api never holds a secret key. */
  FEE_CLAIMER: z.string().min(32),
  TREASURY: z.string().min(32),

  JUPITER_API_URL: z.string().url().default('https://lite-api.jup.ag/swap/v1'),
  JUPITER_API_KEY: z.string().optional(),
  /** Cap Jupiter routes so the Jupiter leg + DBC swap fit one transaction. */
  JUPITER_MAX_ACCOUNTS: z.coerce.number().int().default(32),

  PINATA_JWT: z.string().optional(),
  IPFS_GATEWAY: z.string().url().default('https://gateway.pinata.cloud/ipfs/'),
  PRIORITY_FEE_MICROLAMPORTS: z.coerce.number().int().default(100_000),
  /** Unset = no vanity pool; launches get a random server-generated mint. */
  /** Internal claim signer in chain-service. */
  SIGNER_URL: z.string().url().default('http://chain-service:3002'),
  SIGNER_TOKEN: z.string().min(32).optional(),
  VANITY_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(): Env {
  // `KEY=` in an env file arrives as ""; that means unset.
  const defined = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''))
  const parsed = envSchema.safeParse(defined)
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`)
  }
  return parsed.data
}
