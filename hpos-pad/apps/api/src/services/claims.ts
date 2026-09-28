import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { type Claim, type PrismaClient } from '@hpos-pad/db'
import type pino from 'pino'

export const claimMemo = (id: string) => `hpospad:claim:${id}`

type RpcTx = { meta: { err: unknown; logMessages?: string[] | null } | null; transaction: { signatures: string[] } } | null

/**
 * Claim settlement against the chain. A claim's transaction is identified by
 * the memo it carries (hpospad:claim:<id>); the claimant's own signature is
 * unknown to us until they send, so either they report it (confirm) or we
 * find it in their token account's history once the blockhash has expired.
 */
export class ClaimSettler {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rpcUrl: string,
    private readonly quoteMint: PublicKey,
    private readonly logger: pino.Logger,
  ) {}

  private quoteProgram?: PublicKey

  /** Token program that owns the quote mint (Token-2022 mints derive different ATAs). */
  private async getQuoteProgram(): Promise<PublicKey> {
    if (!this.quoteProgram) {
      const info = await this.rpc<{ value: { owner: string } | null }>('getAccountInfo', [this.quoteMint.toBase58(), { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }])
      if (!info.value) throw new Error('quote mint not found')
      this.quoteProgram = new PublicKey(info.value.owner)
    }
    return this.quoteProgram
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await res.json()) as { result?: T; error?: { message: string } }
    if (body.error) throw new Error(`${method}: ${body.error.message}`)
    return body.result as T
  }

  private getTx(signature: string): Promise<RpcTx> {
    return this.rpc<RpcTx>('getTransaction', [signature, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }])
  }

  /** Is `signature` a successful transaction carrying this claim's memo? */
  async isClaimTx(claim: Claim, signature: string): Promise<'yes' | 'no' | 'unknown'> {
    const tx = await this.getTx(signature)
    if (!tx?.meta) return 'unknown'
    if (tx.meta.err) return 'no'
    return (tx.meta.logMessages ?? []).some((l) => l.includes(claimMemo(claim.id))) ? 'yes' : 'no'
  }

  async markLanded(claim: Claim, signature: string): Promise<void> {
    await this.prisma.claim.updateMany({ where: { id: claim.id, status: 'PENDING' }, data: { status: 'LANDED', signature, settledAt: new Date() } })
    this.logger.info({ claim: claim.id, owner: claim.owner, signature }, 'claim landed')
  }

  /**
   * Resolve a PENDING claim if its fate is decidable: landed (found on chain),
   * or expired (blockhash past and not found). Never expires a claim whose
   * transaction could still land.
   */
  async settle(claim: Claim): Promise<Claim['status']> {
    if (claim.status !== 'PENDING') return claim.status
    if (claim.lastValidBlockHeight === 0n) {
      // Never signed (signer failed mid-request); free it after a grace period.
      if (Date.now() - claim.createdAt.getTime() > 120_000) {
        await this.prisma.claim.updateMany({ where: { id: claim.id, status: 'PENDING' }, data: { status: 'EXPIRED', settledAt: new Date() } })
        return 'EXPIRED'
      }
      return 'PENDING'
    }
    if (claim.signature && (await this.isClaimTx(claim, claim.signature)) === 'yes') {
      await this.markLanded(claim, claim.signature)
      return 'LANDED'
    }
    const height = await this.rpc<number>('getBlockHeight', [{ commitment: 'confirmed' }])
    if (height <= Number(claim.lastValidBlockHeight)) return 'PENDING'

    // Expired: look for it in the claimant's quote account history before giving up.
    const ata = getAssociatedTokenAddressSync(this.quoteMint, new PublicKey(claim.owner), true, await this.getQuoteProgram()).toBase58()
    const sigs = await this.rpc<{ signature: string; err: unknown; blockTime: number | null }[]>('getSignaturesForAddress', [ata, { limit: 30, commitment: 'confirmed' }])
    for (const s of sigs) {
      if (s.err || (s.blockTime && s.blockTime * 1000 < claim.createdAt.getTime() - 60_000)) continue
      if ((await this.isClaimTx(claim, s.signature)) === 'yes') {
        await this.markLanded(claim, s.signature)
        return 'LANDED'
      }
    }
    await this.prisma.claim.updateMany({ where: { id: claim.id, status: 'PENDING' }, data: { status: 'EXPIRED', settledAt: new Date() } })
    this.logger.info({ claim: claim.id, owner: claim.owner }, 'claim expired unlanded; balance released')
    return 'EXPIRED'
  }

  async settleOwner(owner: string): Promise<void> {
    for (const c of await this.prisma.claim.findMany({ where: { owner, status: 'PENDING' } })) await this.settle(c)
  }

  /** Background sweep for claims whose claimant never came back. */
  startReconciler(): NodeJS.Timeout {
    return setInterval(async () => {
      const stale = await this.prisma.claim.findMany({ where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 90_000) } }, take: 50 })
      for (const c of stale) await this.settle(c).catch((err) => this.logger.warn({ err: (err as Error).message, claim: c.id }, 'claim settle failed'))
    }, 60_000)
  }
}
