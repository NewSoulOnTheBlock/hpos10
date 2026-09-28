import { BorshCoder } from '@coral-xyz/anchor'
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID, DynamicBondingCurveIdl } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { CP_AMM_PROGRAM_ID, CpAmmIdl } from '@meteora-ag/cp-amm-sdk'
import type { NormalizedTx, RawIx } from './types.js'

/**
 * Anchor `emit_cpi!` events: a self-CPI whose data is the 8-byte event-ix
 * tag, then the event discriminator and Borsh payload. Reading these rather
 * than program logs means nothing is lost to log truncation.
 */
const EVENT_IX_TAG = Uint8Array.from([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d])

export const DBC_PROGRAM = DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58()
export const CP_AMM_PROGRAM = CP_AMM_PROGRAM_ID.toBase58()

const dbcCoder = new BorshCoder(DynamicBondingCurveIdl as never)
const cpAmmCoder = new BorshCoder(CpAmmIdl as never)

type Num = { toString(): string }
const big = (v: Num): bigint => BigInt(v.toString())
const key = (v: { toBase58(): string }): string => v.toBase58()

export type DbcInitEvent = {
  kind: 'dbc_init'
  pool: string
  config: string
  creator: string
  baseMint: string
}

export type DbcSwapEvent = {
  kind: 'dbc_swap'
  pool: string
  config: string
  /** 0 = base -> quote (sell), 1 = quote -> base (buy). */
  direction: 0 | 1
  inputAmount: bigint
  outputAmount: bigint
  nextSqrtPrice: bigint
  /** trading + protocol + referral: the whole fee the trader paid. */
  feeTotal: bigint
  quoteReserve: bigint
  migrationThreshold: bigint
}

export type DbcCurveCompleteEvent = { kind: 'dbc_curve_complete'; pool: string; config: string }

export type DammSwapEvent = {
  kind: 'damm_swap'
  pool: string
  /** 0 = A -> B, 1 = B -> A. */
  direction: 0 | 1
  inputAmount: bigint
  outputAmount: bigint
  nextSqrtPrice: bigint
  feeTotal: bigint
  reserveA: bigint
  reserveB: bigint
}

type AnyEvent = DbcInitEvent | DbcSwapEvent | DbcCurveCompleteEvent | DammSwapEvent

export type ChainEventDecoded = AnyEvent & {
  /** Position of the event in the transaction; with the signature, the idempotency key. */
  eventIndex: number
}

function isEventIx(data: Uint8Array): boolean {
  if (data.length < 16) return false
  for (let i = 0; i < 8; i++) if (data[i] !== EVENT_IX_TAG[i]) return false
  return true
}

function decodeOne(programId: string, data: Uint8Array): AnyEvent | null {
  const payload = Buffer.from(data.subarray(8)).toString('base64')
  if (programId === DBC_PROGRAM) {
    const ev = dbcCoder.events.decode(payload)
    if (!ev) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = ev.data as any
    switch (ev.name) {
      case 'EvtInitializePool':
        return { kind: 'dbc_init', pool: key(d.pool), config: key(d.config), creator: key(d.creator), baseMint: key(d.base_mint) }
      case 'EvtSwap2': {
        const r = d.swap_result
        return {
          kind: 'dbc_swap',
          pool: key(d.pool),
          config: key(d.config),
          direction: d.trade_direction === 1 ? 1 : 0,
          inputAmount: big(r.included_fee_input_amount) - big(r.amount_left),
          outputAmount: big(r.output_amount),
          nextSqrtPrice: big(r.next_sqrt_price),
          feeTotal: big(r.trading_fee) + big(r.protocol_fee) + big(r.referral_fee),
          quoteReserve: big(d.quote_reserve_amount),
          migrationThreshold: big(d.migration_threshold),
        }
      }
      case 'EvtCurveComplete':
        return { kind: 'dbc_curve_complete', pool: key(d.pool), config: key(d.config) }
      // EvtSwap is emitted alongside EvtSwap2 for every swap; indexing both
      // would double count. Everything else is irrelevant to the indexer.
      default:
        return null
    }
  }
  if (programId === CP_AMM_PROGRAM) {
    const ev = cpAmmCoder.events.decode(payload)
    if (!ev || ev.name !== 'EvtSwap2') return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = ev.data as any
    const r = d.swap_result
    return {
      kind: 'damm_swap',
      pool: key(d.pool),
      direction: d.trade_direction === 1 ? 1 : 0,
      inputAmount: big(r.included_fee_input_amount) - big(r.amount_left),
      outputAmount: big(r.output_amount),
      nextSqrtPrice: big(r.next_sqrt_price),
      feeTotal: big(r.claiming_fee) + big(r.protocol_fee) + big(r.compounding_fee) + big(r.referral_fee),
      reserveA: big(d.reserve_a_amount),
      reserveB: big(d.reserve_b_amount),
    }
  }
  return null
}

/** Every relevant event in the transaction, in execution order. */
export function decodeEvents(tx: NormalizedTx): ChainEventDecoded[] {
  const out: ChainEventDecoded[] = []
  let eventIndex = 0
  const visit = (ix: RawIx) => {
    const programId = tx.accountKeys[ix.programIdIndex]
    if (programId !== DBC_PROGRAM && programId !== CP_AMM_PROGRAM) return
    if (!isEventIx(ix.data)) return
    const ev = decodeOne(programId, ix.data)
    if (ev) out.push({ ...ev, eventIndex: eventIndex++ } as ChainEventDecoded)
  }
  for (const ix of tx.instructions) {
    visit(ix)
    for (const inner of ix.inner) visit(inner)
  }
  return out
}
