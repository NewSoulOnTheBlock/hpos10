import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { createPrisma, totalUnclaimed } from '@hpos-pad/db'
import { toUi } from '@hpos-pad/shared'
import { z } from 'zod'
import { createSolana } from '../clients/solana.js'
import { loadEnv } from '../config/env.js'

/**
 * What the platform can withdraw from the fee claimer without touching
 * money owed to holders.
 *
 *   withdrawable = quote balance - unclaimed reflections - carry - open epochs' pots
 *
 * Withdraw at most this much; the reflector refuses to pay out if the
 * balance ever falls below what holders are owed.
 */
const env = loadEnv(
  z.object({
    DATABASE_URL: z.string(),
    RPC_URL: z.string(),
    DBC_CONFIG: z.string(),
    QUOTE_MINT: z.string(),
    QUOTE_SYMBOL: z.string().default('HPOS10I'),
    QUOTE_DECIMALS: z.coerce.number().int(),
    FEE_CLAIMER: z.string(),
    FEE_CLAIMER_SECRET_KEY: z.string().optional(),
    TREASURY: z.string().optional(),
    PRIORITY_FEE_MICROLAMPORTS: z.coerce.number().int().default(50_000),
  }),
)
const solana = await createSolana(env)
const prisma = createPrisma(env.DATABASE_URL)
const owner = new PublicKey(env.FEE_CLAIMER)

let balance = 0n
try {
  balance = (await getAccount(solana.connection, getAssociatedTokenAddressSync(solana.quoteMint, owner, false, solana.quoteProgram), 'confirmed', solana.quoteProgram)).amount
} catch {
  balance = 0n
}
const carry = (await prisma.token.aggregate({ _sum: { carryQuote: true } }))._sum.carryQuote
const open = await prisma.reflectionEpoch.findMany({ where: { status: { in: ['CLAIMED', 'DISTRIBUTING'] } } })
const raw = (d: { toFixed: (n?: number) => string } | null) => (d ? BigInt(d.toFixed(0)) : 0n)
const openOwed = open.reduce((a, e) => a + raw(e.holdersQuote) + raw(e.carryInQuote) - raw(e.distributedQuote), 0n)
// Accrued-but-unclaimed reflections (claim model) are holder money too.
const unclaimed = await totalUnclaimed(prisma)
const owed = raw(carry) + openOwed + unclaimed
const free = balance > owed ? balance - owed : 0n
const sol = (await solana.connection.getBalance(owner)) / LAMPORTS_PER_SOL
const f = (v: bigint) => `${toUi(v, env.QUOTE_DECIMALS)} ${env.QUOTE_SYMBOL}`

console.log(`\nfee claimer ${owner.toBase58()}`)
console.log(`  ${env.QUOTE_SYMBOL} balance        ${f(balance)}`)
console.log(`  owed to holders      ${f(owed)}  (unclaimed ${f(unclaimed)} + carry ${f(raw(carry))}${open.length ? ` + ${open.length} epoch(s) in progress` : ''})`)
console.log(`  withdrawable         ${f(free)}`)
console.log(`  SOL for fees         ${sol.toFixed(4)}${sol < 0.1 ? '  <- top up' : ''}\n`)

/**
 * --sweep: send the platform's withdrawable income to TREASURY. Refuses while
 * any reflection epoch is open (a claim in flight would look like income),
 * and keeps a 1-unit safety buffer. Holder money is never part of the amount.
 */
if (process.argv.includes('--sweep')) {
  if (!env.FEE_CLAIMER_SECRET_KEY || !env.TREASURY) throw new Error('--sweep needs FEE_CLAIMER_SECRET_KEY and TREASURY')
  if (open.length > 0) throw new Error(`${open.length} reflection epoch(s) in progress; run again after the round finishes`)
  const buffer = 10n ** BigInt(env.QUOTE_DECIMALS)
  const amount = free > buffer ? free - buffer : 0n
  if (amount === 0n) {
    console.log('nothing to sweep')
  } else {
    const { parseKeypair } = await import('../lib/keys.js')
    const { createSender } = await import('../lib/tx.js')
    const { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } = await import('@solana/spl-token')
    const kp = parseKeypair(env.FEE_CLAIMER_SECRET_KEY)
    if (!kp.publicKey.equals(owner)) throw new Error('FEE_CLAIMER_SECRET_KEY does not match FEE_CLAIMER')
    const to = new PublicKey(env.TREASURY)
    if (to.equals(owner)) throw new Error('TREASURY is the fee claimer itself; nothing to move')
    const dst = getAssociatedTokenAddressSync(solana.quoteMint, to, true, solana.quoteProgram)
    const sig = await createSender(solana.connection, env.PRIORITY_FEE_MICROLAMPORTS).send(
      [
        createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, dst, to, solana.quoteMint, solana.quoteProgram),
        createTransferCheckedInstruction(getAssociatedTokenAddressSync(solana.quoteMint, owner, false, solana.quoteProgram), solana.quoteMint, dst, kp.publicKey, amount, env.QUOTE_DECIMALS, [], solana.quoteProgram),
      ],
      [kp],
    )
    console.log(`swept ${f(amount)} to ${to.toBase58()}: https://solscan.io/tx/${sig}`)
  }
}
await prisma.$disconnect()
