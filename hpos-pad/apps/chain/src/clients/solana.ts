import { Connection, PublicKey } from '@solana/web3.js'
import { ExtensionType, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getExtensionTypes, unpackMint } from '@solana/spl-token'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'

export type Solana = {
  connection: Connection
  dbc: DynamicBondingCurveClient
  cpAmm: CpAmm
  config: PublicKey
  quoteMint: PublicKey
  /** Token program that owns the quote mint (legacy SPL Token or Token-2022). */
  quoteProgram: PublicKey
}

/**
 * Extensions that break reflection accounting (the amount sent is not the
 * amount received) or let a third party block payouts. A quote mint with any
 * of these is refused at startup.
 */
const UNSUPPORTED_QUOTE_EXTENSIONS: ExtensionType[] = [
  ExtensionType.TransferFeeConfig,
  ExtensionType.TransferHook,
  ExtensionType.NonTransferable,
  ExtensionType.ConfidentialTransferMint,
]

export async function createSolana(env: { RPC_URL: string; RPC_WS_URL?: string; DBC_CONFIG: string; QUOTE_MINT: string }): Promise<Solana> {
  const connection = new Connection(env.RPC_URL, {
    commitment: 'confirmed',
    ...(env.RPC_WS_URL ? { wsEndpoint: env.RPC_WS_URL } : {}),
  })
  const quoteMint = new PublicKey(env.QUOTE_MINT)
  return {
    connection,
    dbc: new DynamicBondingCurveClient(connection, 'confirmed'),
    cpAmm: new CpAmm(connection),
    config: new PublicKey(env.DBC_CONFIG),
    quoteMint,
    quoteProgram: await resolveQuoteProgram(connection, quoteMint),
  }
}

async function resolveQuoteProgram(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint)
  if (!info) throw new Error(`QUOTE_MINT ${mint.toBase58()} not found`)
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID
  if (!info.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new Error(`QUOTE_MINT ${mint.toBase58()} is not a token mint (owner ${info.owner.toBase58()})`)
  const bad = getExtensionTypes(unpackMint(mint, info, TOKEN_2022_PROGRAM_ID).tlvData).filter((e) => UNSUPPORTED_QUOTE_EXTENSIONS.includes(e))
  if (bad.length) throw new Error(`QUOTE_MINT has unsupported Token-2022 extensions: ${bad.map((e) => ExtensionType[e]).join(', ')}`)
  return TOKEN_2022_PROGRAM_ID
}
