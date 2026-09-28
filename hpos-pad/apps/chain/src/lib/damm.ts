import { type Keypair, PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { type CpAmm, getUnClaimLpFee } from '@meteora-ag/cp-amm-sdk'

const TOKEN_LEGACY = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')

export type DammPosition = { pool: PublicKey; position: PublicKey; positionNftAccount: PublicKey }

/**
 * The fee claimer's LP position in a graduated pool. The config gives the
 * partner 100% of migrated liquidity, permanently locked, so the platform
 * earns the LP fees -- the post-graduation equivalent of the DBC partner fee.
 */
export async function findPartnerPosition(cpAmm: CpAmm, dammPool: string, owner: PublicKey): Promise<DammPosition | null> {
  const pool = new PublicKey(dammPool)
  const owned = await cpAmm.getUserPositionByPool(pool, owner)
  if (owned.length === 0) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liq = (p: any) => BigInt(p.positionState.permanentLockedLiquidity.toString()) + BigInt(p.positionState.unlockedLiquidity.toString())
  const best = owned.reduce((a, b) => (liq(b) > liq(a) ? b : a))
  return { pool, position: best.position, positionNftAccount: best.positionNftAccount }
}

/** Unclaimed quote-side LP fees. */
export async function pendingPositionQuoteFee(cpAmm: CpAmm, pos: DammPosition, baseIsA: boolean): Promise<bigint> {
  const [poolState, positionState] = await Promise.all([cpAmm.fetchPoolState(pos.pool), cpAmm.fetchPositionState(pos.position)])
  const fee = getUnClaimLpFee(poolState, positionState)
  return BigInt((baseIsA ? fee.feeTokenB : fee.feeTokenA).toString())
}

export async function claimPositionFeeIxs(cpAmm: CpAmm, pos: DammPosition, owner: Keypair): Promise<TransactionInstruction[]> {
  const s = await cpAmm.fetchPoolState(pos.pool)
  const tx = await cpAmm.claimPositionFee({
    owner: owner.publicKey,
    position: pos.position,
    pool: pos.pool,
    positionNftAccount: pos.positionNftAccount,
    tokenAMint: s.tokenAMint,
    tokenBMint: s.tokenBMint,
    tokenAVault: s.tokenAVault,
    tokenBVault: s.tokenBVault,
    tokenAProgram: s.tokenAFlag === 1 ? TOKEN_2022 : TOKEN_LEGACY,
    tokenBProgram: s.tokenBFlag === 1 ? TOKEN_2022 : TOKEN_LEGACY,
    feePayer: owner.publicKey,
  } as never)
  return tx.instructions
}
