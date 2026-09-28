import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import { HttpError } from '../middleware/errors.js'

export const WSOL = 'So11111111111111111111111111111111111111112'

export type JupQuote = {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  priceImpactPct: string
  routePlan: { swapInfo: { label?: string } }[]
  [k: string]: unknown
}

type JupIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string }

export type JupSwapInstructions = {
  setupInstructions: JupIx[]
  swapInstruction: JupIx
  cleanupInstruction?: JupIx | null
  otherInstructions?: JupIx[]
  addressLookupTableAddresses: string[]
}

export function toIx(ix: JupIx): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, 'base64'),
  })
}

/**
 * Jupiter occasionally routes through a mint it cannot build for (seen with
 * Token-2022 pump tokens as intermediate hops: "Missing token program for
 * <mint>"). Those failures are route-specific; a direct route avoids them.
 */
export function isRouteSpecificFailure(err: unknown): boolean {
  return err instanceof HttpError && err.status === 502 && /missing token program|no Jupiter route|swap-instructions failed|swap failed/i.test(err.message)
}

export class Jupiter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly maxAccounts: number,
  ) {}

  private headers(): Record<string, string> {
    return { 'content-type': 'application/json', ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}) }
  }

  async quote(p: { inputMint: string; outputMint: string; amount: bigint; slippageBps: number; capAccounts: boolean; maxAccounts?: number; direct?: boolean }): Promise<JupQuote> {
    const q = new URLSearchParams({
      inputMint: p.inputMint,
      outputMint: p.outputMint,
      amount: p.amount.toString(),
      slippageBps: String(p.slippageBps),
      restrictIntermediateTokens: 'true',
      ...(p.capAccounts ? { maxAccounts: String(p.maxAccounts ?? this.maxAccounts) } : {}),
      ...(p.direct ? { onlyDirectRoutes: 'true' } : {}),
    })
    const res = await fetch(`${this.baseUrl}/quote?${q}`, { headers: this.headers(), signal: AbortSignal.timeout(10_000) })
    const body = (await res.json().catch(() => ({}))) as JupQuote & { error?: string }
    if (!res.ok || body.error) throw new HttpError(502, `no Jupiter route: ${body.error ?? res.status}`)
    return body
  }

  /** Instructions to compose into our own transaction (SOL <-> quote leg). */
  async swapInstructions(quote: JupQuote, user: string): Promise<JupSwapInstructions> {
    const res = await fetch(`${this.baseUrl}/swap-instructions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: user, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: false }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await res.json().catch(() => ({}))) as JupSwapInstructions & { error?: string }
    if (!res.ok || body.error) throw new HttpError(502, `Jupiter swap-instructions failed: ${body.error ?? res.status}`)
    return body
  }

  /** A complete Jupiter transaction (used after graduation, when Jupiter routes the whole trade). */
  async swapTransaction(quote: JupQuote, user: string): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
    const res = await fetch(`${this.baseUrl}/swap`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: user,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 2_000_000, priorityLevel: 'high' } },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await res.json().catch(() => ({}))) as { swapTransaction?: string; lastValidBlockHeight?: number; error?: string }
    if (!res.ok || !body.swapTransaction) throw new HttpError(502, `Jupiter swap failed: ${body.error ?? res.status}`)
    return { swapTransaction: body.swapTransaction, lastValidBlockHeight: body.lastValidBlockHeight ?? 0 }
  }
}
