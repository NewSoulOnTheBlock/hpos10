import { createPrisma } from '@hpos-pad/db'
import { z } from 'zod'
import { loadEnv } from '../config/env.js'

/**
 * Hide or show a token on the site. On-chain nothing changes (tokens cannot
 * be deleted on Solana); this only removes it from the board, search, stats
 * and detail pages. Reflections keep running for anyone still holding it.
 *
 *   pnpm token:hide <mint>
 *   pnpm token:show <mint>
 */
const env = loadEnv(z.object({ DATABASE_URL: z.string() }))
const [action, mint] = [process.argv[2], process.argv[3]]
if ((action !== 'hide' && action !== 'show') || !mint) {
  console.error('usage: token-visibility.ts hide|show <mint>')
  process.exit(1)
}
const prisma = createPrisma(env.DATABASE_URL)
const t = await prisma.token.findUnique({ where: { mint } })
if (!t) {
  console.error(`no token ${mint} in the database`)
  process.exit(1)
}
await prisma.token.update({ where: { mint }, data: { hidden: action === 'hide' } })
console.log(`${t.name} ($${t.symbol}) is now ${action === 'hide' ? 'hidden from' : 'visible on'} the site`)
await prisma.$disconnect()
