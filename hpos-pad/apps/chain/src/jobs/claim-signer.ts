import { createServer, type Server } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { ComputeBudgetProgram, type Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { claimableFor, Prisma, type PrismaClient, totalUnclaimed } from '@hpos-pad/db'
import type pino from 'pino'
import type { Solana } from '../clients/solana.js'

export const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
export const claimMemo = (id: string) => `hpospad:claim:${id}`

type Deps = { prisma: PrismaClient; solana: Solana; feeClaimer: Keypair; quoteDecimals: number; priorityMicroLamports: number; logger: pino.Logger }

/**
 * Internal claim signer. The fee claimer key never leaves this process; the
 * api (on the private docker network, with a shared token) asks it to sign
 * one claim: a transfer of exactly the claim's amount from the vault to the
 * claimant, which the claimant pays for (fee payer + their own account rent)
 * and co-signs in their wallet. Each claim row is signed at most once, and
 * the amount is re-checked against the ledger at signing time.
 */
export function startClaimSigner(d: Deps, port: number, token: string): Server {
  const expected = Buffer.from(token)
  const server = createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    try {
      const got = Buffer.from(String(req.headers['x-signer-token'] ?? ''))
      if (got.length !== expected.length || !timingSafeEqual(got, expected)) return reply(401, { error: 'unauthorized' })
      if (req.method !== 'POST' || req.url !== '/claims/sign') return reply(404, { error: 'not found' })
      let raw = ''
      for await (const chunk of req) raw += chunk
      const { claimId } = JSON.parse(raw) as { claimId?: string }
      if (!claimId) return reply(400, { error: 'claimId required' })

      const claim = await d.prisma.claim.findUnique({ where: { id: claimId } })
      if (!claim || claim.status !== 'PENDING' || claim.lastValidBlockHeight !== 0n) return reply(409, { error: 'claim is not signable' })
      // The ledger must still cover it (this claim is already counted as reserved).
      const { accrued, reserved } = await claimableFor(d.prisma, claim.owner)
      if (reserved > accrued) return reply(409, { error: 'claim exceeds accrued balance' })
      // Never pay one holder with another's money: the vault must cover all that is owed.
      const carry = await d.prisma.token.aggregate({ _sum: { carryQuote: true } })
      const owed = (carry._sum.carryQuote ? BigInt(carry._sum.carryQuote.toFixed(0)) : 0n) + (await totalUnclaimed(d.prisma))
      let vaultBal = 0n
      try {
        vaultBal = (await getAccount(d.solana.connection, getAssociatedTokenAddressSync(d.solana.quoteMint, d.feeClaimer.publicKey, false, d.solana.quoteProgram), 'confirmed', d.solana.quoteProgram)).amount
      } catch {
        vaultBal = 0n
      }
      if (vaultBal < owed) return reply(409, { error: 'claims are paused for a moment while the vault settles; try again shortly' })

      const owner = new PublicKey(claim.owner)
      const mint = d.solana.quoteMint
      const amount = BigInt(claim.amount.toFixed(0))
      const vault = getAssociatedTokenAddressSync(mint, d.feeClaimer.publicKey, false, d.solana.quoteProgram)
      const dest = getAssociatedTokenAddressSync(mint, owner, true, d.solana.quoteProgram)
      const { blockhash, lastValidBlockHeight } = await d.solana.connection.getLatestBlockhash('confirmed')
      const message = new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: d.priorityMicroLamports }),
          createAssociatedTokenAccountIdempotentInstruction(owner, dest, owner, mint, d.solana.quoteProgram),
          createTransferCheckedInstruction(vault, mint, dest, d.feeClaimer.publicKey, amount, d.quoteDecimals, [], d.solana.quoteProgram),
          new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(claimMemo(claim.id)) }),
        ],
      }).compileToV0Message()
      const tx = new VersionedTransaction(message)
      tx.sign([d.feeClaimer])
      const transaction = Buffer.from(tx.serialize()).toString('base64')

      // Record before returning: a signed claim is never signed again.
      const updated = await d.prisma.claim.updateMany({
        where: { id: claim.id, status: 'PENDING', lastValidBlockHeight: 0n },
        data: { lastValidBlockHeight: BigInt(lastValidBlockHeight), transaction },
      })
      if (updated.count !== 1) return reply(409, { error: 'claim was signed concurrently' })
      d.logger.info({ claim: claim.id, owner: claim.owner, amount: new Prisma.Decimal(amount.toString()).toString() }, 'claim signed')
      return reply(200, { transaction, lastValidBlockHeight })
    } catch (err) {
      d.logger.error({ err: (err as Error).message }, 'claim signer error')
      return reply(500, { error: 'signer error' })
    }
  })
  server.listen(port, () => d.logger.info({ port }, 'claim signer listening (internal)'))
  return server
}
