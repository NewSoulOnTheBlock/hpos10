import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Keypair } from '@solana/web3.js'
import { createPrisma, sealSecret } from '@hpos-pad/db'
import { z } from 'zod'
import { loadEnv } from '../config/env.js'

/**
 * Vanity mint pool.
 *
 *   pnpm vanity:grind 250     grind 250 keypairs ending in VANITY_SUFFIX, then import them
 *   pnpm vanity:import        import keys/vanity/*.json (encrypted), move files to keys/vanity/imported/
 *   pnpm vanity:status        available / reserved / used
 *
 * Grinding uses solana-keygen (native, all cores). A 4-char case-sensitive
 * suffix is ~11M tries per key: about 10-20 s each on a laptop.
 */
const env = loadEnv(
  z.object({
    DATABASE_URL: z.string(),
    VANITY_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'VANITY_ENCRYPTION_KEY must be 64 hex chars (openssl rand -hex 32)'),
    VANITY_SUFFIX: z.string().default('hpos'),
    VANITY_DIR: z.string().default(resolve(process.cwd(), '../../keys/vanity')),
  }),
)
const prisma = createPrisma(env.DATABASE_URL)
const [cmd, arg] = [process.argv[2], process.argv[3]]

async function importDir(): Promise<void> {
  const dir = env.VANITY_DIR
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  const done = join(dir, 'imported')
  mkdirSync(done, { recursive: true, mode: 0o700 })
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  let added = 0
  for (const f of files) {
    const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(dir, f), 'utf8')) as number[]))
    const pubkey = kp.publicKey.toBase58()
    if (!pubkey.endsWith(env.VANITY_SUFFIX)) {
      console.warn(`  skip ${f}: does not end with "${env.VANITY_SUFFIX}"`)
      continue
    }
    const r = await prisma.vanityMint.createMany({ data: [{ pubkey, secret: sealSecret(kp.secretKey, env.VANITY_ENCRYPTION_KEY) }], skipDuplicates: true })
    added += r.count
    renameSync(join(dir, f), join(done, f))
  }
  console.log(`imported ${added} new vanity mint(s) from ${files.length} file(s)`)
}

async function status(): Promise<void> {
  // Handed out once, never again: "reserved" ones are only ever returned to the same creator.
  const [available, reserved, used] = await Promise.all([
    prisma.vanityMint.count({ where: { usedAt: null, reservedAt: null } }),
    prisma.vanityMint.count({ where: { usedAt: null, reservedAt: { not: null } } }),
    prisma.vanityMint.count({ where: { usedAt: { not: null } } }),
  ])
  console.log(`vanity mints (…${env.VANITY_SUFFIX}): ${available} available, ${reserved} handed out (not launched), ${used} launched`)
}

if (cmd === 'import') await importDir()
else if (cmd === 'status') await status()
else if (cmd === 'grind') {
  const n = Number(arg ?? 100)
  mkdirSync(env.VANITY_DIR, { recursive: true, mode: 0o700 })
  console.log(`grinding ${n} keypairs ending in "${env.VANITY_SUFFIX}" into ${env.VANITY_DIR} ...`)
  const r = spawnSync('solana-keygen', ['grind', '--ends-with', `${env.VANITY_SUFFIX}:${n}`], { cwd: env.VANITY_DIR, stdio: 'inherit' })
  if (r.status !== 0) throw new Error('solana-keygen grind failed (is the Solana CLI installed?)')
  await importDir()
} else {
  console.error('usage: vanity.ts grind <n> | import | status')
  process.exitCode = 1
}
await status().catch(() => {})
await prisma.$disconnect()
