import BN from 'bn.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js'
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import { createPrisma } from '@hpos-pad/db'
import type { BuiltTransaction, TokenDTO } from '@hpos-pad/shared'
import { feeSplit, toRaw, toUi, type FeeSplit } from '@hpos-pad/shared'
let feeSplitFromApi: FeeSplit
import { z } from 'zod'
import { loadEnv } from '../config/env.js'
import { createSender } from '../lib/tx.js'

/**
 * End-to-end test of the whole pad against a local mainnet fork (Surfpool).
 * Drives the real api (launch + trade builds), the real indexer and the real
 * service (reflector + migrator), and checks the money at every step against
 * on-chain state.
 *
 *   surfpool start --rpc-url <mainnet rpc> --no-tui
 *   (run api/indexer/service against the fork, with a config created there)
 *   E2E_KEYS_DIR=... E2E_API_URL=http://localhost:3012 pnpm test:fork
 *
 * Refuses to run against anything but a local RPC.
 */
const env = loadEnv(
  z.object({
    RPC_URL: z.string(),
    DATABASE_URL: z.string(),
    DBC_CONFIG: z.string(),
    QUOTE_MINT: z.string(),
    QUOTE_DECIMALS: z.coerce.number().int(),
    FEE_CLAIMER: z.string(),
    TREASURY: z.string(),
    E2E_API_URL: z.string().default('http://localhost:3012'),
    E2E_KEYS_DIR: z.string(),
    E2E_METADATA_URI: z.string().url(),
  }),
)
if (!/localhost|127\.0\.0\.1/.test(env.RPC_URL)) throw new Error('e2e-fork only runs against a local fork RPC')

const conn = new Connection(env.RPC_URL, 'confirmed')
const dbc = new DynamicBondingCurveClient(conn, 'confirmed')
const cpAmm = new CpAmm(conn)
const prisma = createPrisma(env.DATABASE_URL)
const sender = createSender(conn, 1_000)
const QUOTE = new PublicKey(env.QUOTE_MINT)
const qd = env.QUOTE_DECIMALS
const QUOTE_SYMBOL = process.env.QUOTE_SYMBOL || 'HPOS10I'
const key = (n: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(env.E2E_KEYS_DIR, `${n}.json`), 'utf8')) as number[]))
const [creator, alice, bob, whale] = ['creator', 'alice', 'bob', 'whale'].map(key) as [Keypair, Keypair, Keypair, Keypair]
const feeClaimer = new PublicKey(env.FEE_CLAIMER)
const treasury = new PublicKey(env.TREASURY)

/* ------------------------------ harness ------------------------------ */

const results: { name: string; ok: boolean; detail: string }[] = []
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${name}  ${detail}`)
}
const step = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const q = (raw: bigint) => `${toUi(raw, qd)} ${QUOTE_SYMBOL}`

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(env.RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const j = (await res.json()) as { result?: unknown; error?: { message: string } }
  if (j.error) throw new Error(`${method}: ${j.error.message}`)
  return j.result
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${env.E2E_API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(`${path}: ${res.status} ${j.error ?? ''}`)
  return j
}
async function quoteBal(owner: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(conn, getAssociatedTokenAddressSync(QUOTE, owner, true))).amount
  } catch {
    return 0n
  }
}
async function tokenBal(mint: PublicKey, owner: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(conn, getAssociatedTokenAddressSync(mint, owner, true))).amount
  } catch {
    return 0n
  }
}
async function waitFor<T>(what: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 180_000): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = await fn().catch(() => null)
    if (v) return v
    await sleep(2_000)
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** Sign an api-built transaction (plus pre-transactions) with local keys and land it on the fork. */
async function signAndSend(built: BuiltTransaction, signers: Keypair[]): Promise<string> {
  let last = ''
  for (const b64 of [...(built.preTransactions ?? []), built.transaction]) {
    const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'))
    const needed = new Set(tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).map((k) => k.toBase58()))
    tx.sign(signers.filter((s) => needed.has(s.publicKey.toBase58())))
    last = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false })
    const st = await waitFor('confirmation', async () => (await conn.getSignatureStatus(last)).value, 60_000)
    if (st.err) throw new Error(`tx ${last} failed: ${JSON.stringify(st.err)}`)
  }
  return last
}

async function trade(who: Keypair, mint: string, side: 'BUY' | 'SELL', amount: string, payWith: 'SOL' | 'QUOTE' = 'QUOTE'): Promise<string> {
  const built = await api<BuiltTransaction>('/trade/build', { mint, owner: who.publicKey.toBase58(), side, amount, payWith, slippageBps: 1_000 })
  return signAndSend(built, [who])
}

/* -------------------------------- run -------------------------------- */

async function main(): Promise<void> {
  step('0. Fund wallets on the fork')
  const cfgDto = await api<{ fees: { tradeFeeBps: number; reflectionBps: number; creatorBps: number } }>('/config')
  feeSplitFromApi = feeSplit(cfgDto.fees)
  console.log(`  fee model from /config: ${feeSplitFromApi.tradeFeeBps / 100}% = holders ${feeSplitFromApi.reflectionBps / 100} + creator ${feeSplitFromApi.creatorBps / 100} + platform ${feeSplitFromApi.platformBps / 100} + Meteora ${feeSplitFromApi.protocolBps / 100}`)
  for (const w of [creator, alice, bob, whale]) await rpc('requestAirdrop', [w.publicKey.toBase58(), 20e9])
  // Quote UI units. The whale fills the curve (graduation needs ~430k HPOS10I on the default config).
  const funding = { creator: 5_000, alice: 20_000, bob: 20_000, whale: 1_500_000 }
  for (const [n, amt] of Object.entries(funding)) {
    const w = { creator, alice, bob, whale }[n as keyof typeof funding]
    await rpc('surfnet_setTokenAccount', [w.publicKey.toBase58(), QUOTE.toBase58(), { amount: Number(toRaw(String(amt), qd)) }])
  }
  await sleep(1_500)
  check('wallets funded', (await quoteBal(whale.publicKey)) === toRaw(String(funding.whale), qd), `whale ${q(await quoteBal(whale.publicKey))}`)
  const treasury0 = await quoteBal(treasury)
  const t0 = new Date()

  step('1. Launch with a 100 quote first buy (api /launch/build)')
  const mint = Keypair.generate()
  const built = await api<BuiltTransaction>('/launch/build', {
    creator: creator.publicKey.toBase58(),
    mint: mint.publicKey.toBase58(),
    name: 'Fork Test',
    symbol: 'FORK',
    uri: env.E2E_METADATA_URI,
    twitter: 'https://x.com/forktest',
    firstBuy: { amount: '100', payWith: 'QUOTE', slippageBps: 1_000 },
  })
  await signAndSend(built, [creator, mint])
  const M = mint.publicKey.toBase58()
  const token = await waitFor('indexer to pick up the launch', () => api<TokenDTO>(`/tokens/${M}`))
  check('indexed launch', token.symbol === 'FORK' && token.twitter === 'https://x.com/forktest', `${token.name} $${token.symbol}, socials from draft`)
  const pool = new PublicKey(token.pool)

  step('2. Trading on the curve')
  await trade(alice, M, 'BUY', '3000')
  await trade(bob, M, 'BUY', '1500')
  const aliceTokens = await tokenBal(mint.publicKey, alice.publicKey)
  await trade(alice, M, 'SELL', toUi(aliceTokens / 3n, 6))
  let solLeg = 'skipped'
  try {
    await trade(bob, M, 'BUY', '0.2', 'SOL')
    solLeg = 'ok'
  } catch (err) {
    solLeg = `failed: ${(err as Error).message.slice(0, 80)}`
  }
  console.log(`  (pay-with-SOL via Jupiter on the fork: ${solLeg})`)

  // Two holders who never touch the quote token (they receive the token by transfer): claim-path wallets.
  const carol = Keypair.generate()
  const dave = Keypair.generate()
  for (const w of [carol, dave]) await rpc('requestAirdrop', [w.publicKey.toBase58(), 2e9])
  const aliceNow = await tokenBal(mint.publicKey, alice.publicKey)
  const give = (to: PublicKey) => [
    createAssociatedTokenAccountIdempotentInstruction(alice.publicKey, getAssociatedTokenAddressSync(mint.publicKey, to), to, mint.publicKey),
    createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint.publicKey, alice.publicKey), mint.publicKey, getAssociatedTokenAddressSync(mint.publicKey, to), alice.publicKey, aliceNow / 4n, 6),
  ]
  await sender.send([...give(carol.publicKey), ...give(dave.publicKey)], [alice])
  await sleep(1_500)
  check('claim-path holders have no quote account', (await quoteBal(carol.publicKey)) === 0n && !(await conn.getAccountInfo(getAssociatedTokenAddressSync(QUOTE, carol.publicKey))), 'carol and dave hold the token, not the quote')

  const expectedTrades = solLeg === 'ok' ? 5 : 4
  await waitFor('all trades indexed', async () => (await prisma.trade.count({ where: { mint: M } })) >= expectedTrades)
  const trades = await prisma.trade.findMany({ where: { mint: M, venue: 'DBC' } })
  const indexedFees = trades.reduce((a, t) => a + BigInt(t.feeQuote.toFixed(0)), 0n)

  step('3. Fees (cumulative on-chain counters, independent of when the reflector claims)')
  const st = (await dbc.state.getPool(pool))!.poolState
  const totalTrading = BigInt(st.metrics.totalTradingQuoteFee.toString())
  const totalProtocol = BigInt(st.metrics.totalProtocolQuoteFee.toString())
  check('on-chain creator fee is 0 (the service pays the creator share)', BigInt(st.creatorQuoteFee.toString()) === 0n, `creatorQuoteFee ${q(BigInt(st.creatorQuoteFee.toString()))}`)
  check('indexer fees == on-chain fees', indexedFees === totalTrading + totalProtocol, `indexed ${q(indexedFees)} / chain ${q(totalTrading + totalProtocol)}`)
  const protoShare = Number((totalProtocol * 10_000n) / (totalTrading + totalProtocol)) / 100
  check('Meteora takes 20% of the fee', Math.abs(protoShare - 20) < 0.1, `${protoShare}%`)
  const buys = trades.filter((t) => t.side === 'BUY')
  const buyVol = buys.reduce((a, t) => a + BigInt(t.quoteAmount.toFixed(0)), 0n)
  const buyFees = buys.reduce((a, t) => a + BigInt(t.feeQuote.toFixed(0)), 0n)
  const rate = Number((buyFees * 1_000_000n) / buyVol) / 10_000
  const feePct = feeSplitFromApi.tradeFeeBps / 100
  check(`trade fee is ${feePct}%`, Math.abs(rate - feePct) < 0.01, `buys paid ${rate}% of quote in`)

  step('4. Reflections (service reflector, however many epochs it took)')
  // Settled = every claimable fee claimed and no epoch still in flight.
  await waitFor(
    'all curve fees claimed and paid',
    async () => {
      const left = BigInt((await dbc.state.getPool(pool))!.poolState.partnerQuoteFee.toString())
      const open = await prisma.reflectionEpoch.count({ where: { mint: M, status: { in: ['CLAIMED', 'DISTRIBUTING'] } } })
      const done = await prisma.reflectionEpoch.count({ where: { mint: M, status: 'DONE' } })
      return left === 0n && open === 0 && done > 0
    },
    300_000,
  )
  const epochs = await prisma.reflectionEpoch.findMany({ where: { mint: M, venue: 'DBC' }, include: { payouts: true }, orderBy: { createdAt: 'asc' } })
  const sum = (f: (e: (typeof epochs)[number]) => { toFixed: (n?: number) => string }) => epochs.reduce((a, e) => a + BigInt(f(e).toFixed(0)), 0n)
  const claimedAll = sum((e) => e.claimedQuote)
  const platformAll = sum((e) => e.platformQuote)
  check('claimed exactly the partner fee (80% of all fees)', claimedAll === totalTrading, `${epochs.length} epoch(s) claimed ${q(claimedAll)} / partner fee ${q(totalTrading)}`)
  // Split of each claim in proportion to bps of volume (floor; remainder to holders).
  const split = feeSplitFromApi
  const part = (claimed: bigint, bps: number) => (claimed * BigInt(Math.round(bps * 100))) / BigInt(Math.round(split.claimableBps * 100))
  // With reflections off the rounding remainder goes to the platform (splitClaim).
  const platformPart = (claimed: bigint) => (split.reflectionBps === 0 ? claimed - part(claimed, split.creatorBps) : part(claimed, split.platformBps))
  check(
    `platform gets ${split.platformBps / 100}% of volume (${split.platformBps}/${split.claimableBps} of each claim)`,
    epochs.every((e) => BigInt(e.platformQuote.toFixed(0)) === platformPart(BigInt(e.claimedQuote.toFixed(0)))),
    `${q(platformAll)} of ${q(claimedAll)}`,
  )
  const creatorAll = sum((e) => e.creatorQuote)
  check(
    `creator gets ${split.creatorBps / 100}% of volume (${split.creatorBps}/${split.claimableBps} of each claim)`,
    epochs.every((e) => BigInt(e.creatorQuote.toFixed(0)) === part(BigInt(e.claimedQuote.toFixed(0)), split.creatorBps)),
    `${q(creatorAll)} of ${q(claimedAll)}`,
  )
  // The creator is also a holder, so compare against their creator transfers specifically.
  let creatorLanded = 0n
  for (const e of epochs) {
    if (!e.creatorSignature) continue
    const tx = await conn.getTransaction(e.creatorSignature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
    const bal = (rows: typeof tx extends null ? never : NonNullable<NonNullable<typeof tx>['meta']>['postTokenBalances']) =>
      (rows ?? []).filter((b) => b.owner === creator.publicKey.toBase58() && b.mint === QUOTE.toBase58()).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n)
    creatorLanded += bal(tx?.meta?.postTokenBalances) - bal(tx?.meta?.preTokenBalances)
  }
  check('creator share actually arrived in the creator wallet', creatorLanded === creatorAll && creatorAll > 0n, `+${q(creatorLanded)} to ${creator.publicKey.toBase58().slice(0, 6)}…`)
  const tokenRow = await prisma.token.findUniqueOrThrow({ where: { mint: M } })
  check('token creatorEarned total matches the ledger', BigInt(tokenRow.creatorEarnedQuote.toFixed(0)) === creatorAll, q(creatorAll))
  // Other tokens on the fork (earlier runs) may pay the same treasury inside this window; count every epoch since t0.
  const treasuryNow = await quoteBal(treasury)
  const windowPlatform = (await prisma.reflectionEpoch.findMany({ where: { createdAt: { gte: t0 }, platformSignature: { not: null } } })).reduce(
    (a, e) => a + BigInt(e.platformQuote.toFixed(0)),
    0n,
  )
  check('treasury received exactly the platform share', treasuryNow - treasury0 === windowPlatform, `treasury +${q(treasuryNow - treasury0)}, this token ${q(platformAll)}`)
  check(
    'ledger conserves every unit, every epoch',
    epochs.every((e) => BigInt(e.distributedQuote.toFixed(0)) + BigInt(e.carriedQuote.toFixed(0)) === BigInt(e.holdersQuote.toFixed(0)) + BigInt(e.carryInQuote.toFixed(0))),
    `holders' share = ${q(sum((e) => e.holdersQuote))}, distributed ${q(sum((e) => e.distributedQuote))}`,
  )

  if (split.reflectionBps === 0) {
    // Reflections off (The Hatchery's default): holders get nothing, nobody can claim.
    check('reflections off: no holder share, no payouts', epochs.every((e) => BigInt(e.holdersQuote.toFixed(0)) === 0n && e.payouts.length === 0), `${epochs.length} epoch(s)`)
    check('claimed = creator + platform exactly', claimedAll === creatorAll + platformAll, `${q(creatorAll)} + ${q(platformAll)}`)
    type Claimable0 = { claimableQuote: string }
    const c0 = await api<Claimable0>(`/wallets/${carol.publicKey.toBase58()}/claimable`)
    check('nothing claimable for holders', toRaw(c0.claimableQuote, qd) === 0n, `carol ${c0.claimableQuote} ${QUOTE_SYMBOL}`)
    const refused = await fetch(`${env.E2E_API_URL}/claims/build`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: carol.publicKey.toBase58() }) })
    check('a claim is refused', refused.status === 400, `HTTP ${refused.status}`)
  } else {
  // Every recorded payout really moved that amount to that wallet, per its own transaction.
  const payoutRows = epochs.flatMap((e) => e.payouts).filter((p) => p.signature)
  let arrived = true
  for (const sig of new Set(payoutRows.map((p) => p.signature!))) {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
    const delta = (owner: string) =>
      (tx?.meta?.postTokenBalances ?? []).filter((b) => b.owner === owner && b.mint === QUOTE.toBase58()).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n) -
      (tx?.meta?.preTokenBalances ?? []).filter((b) => b.owner === owner && b.mint === QUOTE.toBase58()).reduce((a, b) => a + BigInt(b.uiTokenAmount.amount), 0n)
    for (const p of payoutRows.filter((r) => r.signature === sig)) if (delta(p.owner) !== BigInt(p.amount.toFixed(0))) arrived = false
  }
  check('pushed payouts actually arrived in wallets', arrived, `${payoutRows.length} pushed payouts verified against their transactions`)

  // Pro-rata, checked on the latest epoch (holdings have not changed since).
  const last = epochs[epochs.length - 1]!
  const lastPot = BigInt(last.holdersQuote.toFixed(0)) + BigInt(last.carryInQuote.toFixed(0))
  const payouts = new Map(last.payouts.map((p) => [p.owner, BigInt(p.amount.toFixed(0))]))
  const balances = new Map<string, bigint>()
  for (const w of [creator, alice, bob, carol, dave]) balances.set(w.publicKey.toBase58(), await tokenBal(mint.publicKey, w.publicKey))
  const eligible = [...balances.values()].reduce((a, b) => a + b, 0n)
  let prorataOk = true
  for (const [owner, bal] of balances) {
    const expected = (lastPot * bal) / eligible
    const got = payouts.get(owner) ?? 0n
    if (got > expected || expected - got > 1n) prorataOk = false
  }
  check('payouts are pro-rata by holdings', prorataOk, [...balances.keys()].map((o) => `${o.slice(0, 4)}:${q(payouts.get(o) ?? 0n)}`).join(' '))
  check('pool/bonding curve excluded from payouts', [...payouts.keys()].every((o) => balances.has(o)), `${payouts.size} recipients`)

  step('4b. Claims (holders without a quote account)')
  const accrued = (owner: PublicKey) =>
    epochs.flatMap((e) => e.payouts).filter((p) => p.owner === owner.toBase58() && !p.signature).reduce((a, p) => a + BigInt(p.amount.toFixed(0)), 0n)
  check('holders with a quote account were pushed, others accrued', epochs.flatMap((e) => e.payouts).every((p) => (p.signature ? [creator, alice, bob].some((w) => w.publicKey.toBase58() === p.owner) : [carol, dave].some((w) => w.publicKey.toBase58() === p.owner))), 'push vs accrue by account')
  type Claimable = { claimableQuote: string; pending: { id: string } | null }
  const carolClaimable = await api<Claimable>(`/wallets/${carol.publicKey.toBase58()}/claimable`)
  check('claimable equals the accrued share', toRaw(carolClaimable.claimableQuote, qd) === accrued(carol.publicKey) && accrued(carol.publicKey) > 0n, `carol ${carolClaimable.claimableQuote} ${QUOTE_SYMBOL}`)
  const cb = await api<{ claimId: string; transaction: string; amountQuote: string }>('/claims/build', { owner: carol.publicKey.toBase58() })
  const again = await api<{ claimId: string }>('/claims/build', { owner: carol.publicKey.toBase58() })
  check('a retry returns the same pending claim (no second claim)', again.claimId === cb.claimId, cb.claimId)
  const ctx = VersionedTransaction.deserialize(Buffer.from(cb.transaction, 'base64'))
  ctx.sign([carol])
  const csig = await conn.sendRawTransaction(ctx.serialize())
  await waitFor('claim landed', async () => (await conn.getSignatureStatus(csig)).value?.confirmationStatus, 60_000)
  const conf = await api<{ status: string }>(`/claims/${cb.claimId}/confirm`, { signature: csig })
  check('claim confirmed as landed', conf.status === 'LANDED', csig.slice(0, 12))
  check('claimant received exactly the claim (and paid for their own quote account)', (await quoteBal(carol.publicKey)) === toRaw(cb.amountQuote, qd), `carol +${cb.amountQuote} ${QUOTE_SYMBOL}`)
  const after = await api<Claimable>(`/wallets/${carol.publicKey.toBase58()}/claimable`)
  check('nothing left to claim after claiming', toRaw(after.claimableQuote, qd) === 0n, after.claimableQuote)
  const second = await fetch(`${env.E2E_API_URL}/claims/build`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: carol.publicKey.toBase58() }) })
  check('a second claim is refused', second.status === 400, `HTTP ${second.status}`)

  // Dave builds a claim and never sends it: once its blockhash expires the balance must come back.
  const daveBefore = toRaw((await api<Claimable>(`/wallets/${dave.publicKey.toBase58()}/claimable`)).claimableQuote, qd)
  await api('/claims/build', { owner: dave.publicKey.toBase58() })
  const reserved = await api<Claimable>(`/wallets/${dave.publicKey.toBase58()}/claimable`)
  check('an open claim reserves the balance', toRaw(reserved.claimableQuote, qd) === 0n && !!reserved.pending, 'claimable 0 while pending')
  const released = await waitFor(
    'abandoned claim to expire',
    async () => {
      const c = await api<Claimable>(`/wallets/${dave.publicKey.toBase58()}/claimable`)
      return c.pending ? null : c
    },
    240_000,
  )
  check('an abandoned claim expires and the balance returns', toRaw(released.claimableQuote, qd) === daveBefore && daveBefore > 0n, `dave ${released.claimableQuote} ${QUOTE_SYMBOL} claimable again`)

  }

  step('4c. Life watch (vitals job): creator flow recorded, a young token is ALIVE')
  const vit = await waitFor('vitals to record the creator buy', async () => {
    const t = await prisma.token.findUniqueOrThrow({ where: { mint: M } })
    return BigInt(t.creatorBoughtBase.toFixed(0)) > 0n ? t : null
  }, 180_000)
  check('creator buy recorded', BigInt(vit.creatorBoughtBase.toFixed(0)) === (await tokenBal(mint.publicKey, creator.publicKey)) + BigInt(vit.creatorSoldBase.toFixed(0)), `bought ${vit.creatorBoughtBase.toFixed(0)} raw, sold ${vit.creatorSoldBase.toFixed(0)}`)
  // Not RUGGED is the rule. (It may read DEAD here: Surfpool reports block times near 1970, so the token looks idle.)
  check('a curve token is never RUGGED', vit.lifeState !== 'RUGGED', vit.lifeState)

  step('5. Graduation (fill the curve, migrator moves it to DAMM v2)')
  const cfg = (await dbc.state.getPoolConfig(env.DBC_CONFIG))!
  const reserve = BigInt((await dbc.state.getPool(pool))!.poolState.quoteReserve.toString())
  const need = BigInt(cfg.migrationQuoteThreshold.toString()) - reserve
  // The curve's last swap may overshoot; the program returns the surplus.
  await trade(whale, M, 'BUY', toUi((need * 106n) / 100n, qd))
  const graduated = await waitFor('migration to DAMM v2', async () => {
    const t = await api<TokenDTO>(`/tokens/${M}`)
    return t.status === 'MIGRATED' && t.dammPool ? t : null
  }, 240_000)
  check('graduated automatically', !!graduated.dammPool, `DAMM v2 pool ${graduated.dammPool}`)
  const positions = await cpAmm.getUserPositionByPool(new PublicKey(graduated.dammPool!), feeClaimer)
  const locked = positions.reduce((a, p) => a + BigInt(p.positionState.permanentLockedLiquidity.toString()), 0n)
  const unlocked = positions.reduce((a, p) => a + BigInt(p.positionState.unlockedLiquidity.toString()), 0n)
  check('LP owned by the platform and permanently locked', locked > 0n && unlocked === 0n, `${positions.length} position(s), locked ${locked}, unlocked ${unlocked}`)

  step('6. After graduation: DAMM v2 trade, LP fees, reflections continue')
  const dammPool = new PublicKey(graduated.dammPool!)
  const ps = await cpAmm.fetchPoolState(dammPool)
  const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  const bobTokens = await tokenBal(mint.publicKey, bob.publicKey)
  const swapTx = await cpAmm.swap({
    payer: bob.publicKey,
    pool: dammPool,
    inputTokenMint: mint.publicKey,
    outputTokenMint: QUOTE,
    amountIn: new BN((bobTokens / 2n).toString()),
    minimumAmountOut: new BN(0),
    tokenAMint: ps.tokenAMint,
    tokenBMint: ps.tokenBMint,
    tokenAVault: ps.tokenAVault,
    tokenBVault: ps.tokenBVault,
    tokenAProgram: TOKEN,
    tokenBProgram: TOKEN,
    referralTokenAccount: null,
  })
  await sender.send(swapTx.instructions, [bob])
  const dammTrade = await waitFor('DAMM v2 trade indexed', () => prisma.trade.findFirst({ where: { mint: M, venue: 'DAMM_V2' } }), 120_000)
  check('post-graduation trade indexed', !!dammTrade, `${dammTrade.side} ${q(BigInt(dammTrade.quoteAmount.toFixed(0)))}`)
  const dammEpoch = await waitFor(
    'a DONE post-graduation epoch',
    () => prisma.reflectionEpoch.findFirst({ where: { mint: M, status: 'DONE', venue: 'DAMM_V2', claimedQuote: { gt: 0 } } }),
    240_000,
  )
  const dClaim = BigInt(dammEpoch.claimedQuote.toFixed(0))
  const dPlat = BigInt(dammEpoch.platformQuote.toFixed(0))
  check('LP fees claimed after graduation', dClaim > 0n, `claimed ${q(dClaim)}`)
  const dPart = (bps: number) => (dClaim * BigInt(Math.round(bps * 100))) / BigInt(Math.round(feeSplitFromApi.claimableBps * 100))
  check(
    'post-graduation split unchanged (platform + creator)',
    dPlat === (feeSplitFromApi.reflectionBps === 0 ? dClaim - dPart(feeSplitFromApi.creatorBps) : dPart(feeSplitFromApi.platformBps)) && BigInt(dammEpoch.creatorQuote.toFixed(0)) === dPart(feeSplitFromApi.creatorBps),
    `platform ${q(dPlat)}, creator ${q(BigInt(dammEpoch.creatorQuote.toFixed(0)))} of ${q(dClaim)}`,
  )
  check(
    'post-graduation ledger conserves',
    BigInt(dammEpoch.distributedQuote.toFixed(0)) + BigInt(dammEpoch.carriedQuote.toFixed(0)) === BigInt(dammEpoch.holdersQuote.toFixed(0)) + BigInt(dammEpoch.carryInQuote.toFixed(0)),
    `${dammEpoch.recipients} recipients`,
  )

  step('7. Earnings API')
  const earn = await api<{ totalQuote: string; tokens: { mint: string; totalQuote: string }[] }>(`/wallets/${alice.publicKey.toBase58()}/earnings?mint=${M}`)
  const ledgerAlice = await prisma.reflectionPayout.aggregate({ where: { owner: alice.publicKey.toBase58(), mint: M }, _sum: { amount: true } })
  check('earnings endpoint matches the ledger', toRaw(earn.totalQuote, qd) === BigInt(ledgerAlice._sum.amount?.toFixed(0) ?? '0'), `alice earned ${earn.totalQuote} ${QUOTE_SYMBOL}`)
}

main()
  .catch((err) => check('run completed', false, (err as Error).message))
  .finally(async () => {
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `; failed: ${failed.map((f) => f.name).join(', ')}` : ''}\n`)
    await prisma.$disconnect()
    process.exit(failed.length ? 1 : 0)
  })
