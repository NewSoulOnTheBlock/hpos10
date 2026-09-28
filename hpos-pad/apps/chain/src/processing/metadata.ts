import { type Connection, PublicKey } from '@solana/web3.js'

const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

export type TokenMeta = {
  name: string
  symbol: string
  uri: string
  description: string | null
  imageUrl: string | null
  website: string | null
  twitter: string | null
  telegram: string | null
}

/** Borsh string: u32 length + bytes, NUL-padded by Metaplex. */
function readString(buf: Buffer, offset: number): [string, number] {
  const len = buf.readUInt32LE(offset)
  const s = buf.subarray(offset + 4, offset + 4 + len).toString('utf8').replace(/\0+$/, '')
  return [s.trim(), offset + 4 + len]
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null)

/**
 * On-chain Metaplex metadata plus the off-chain JSON it points at. Used for
 * tokens launched against our config without going through /launch/build
 * (so there is no LaunchDraft), and as the source of truth for name/symbol.
 */
export async function fetchTokenMeta(connection: Connection, mint: string): Promise<TokenMeta | null> {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METAPLEX.toBuffer(), new PublicKey(mint).toBuffer()],
    METAPLEX,
  )
  const acc = await connection.getAccountInfo(pda)
  if (!acc) return null
  // key(1) + update_authority(32) + mint(32), then name, symbol, uri.
  let o = 65
  const [name, o1] = readString(acc.data, o)
  const [symbol, o2] = readString(acc.data, o1)
  const [uri] = readString(acc.data, o2)
  o = o2

  const meta: TokenMeta = { name, symbol, uri, description: null, imageUrl: null, website: null, twitter: null, telegram: null }
  if (!/^https?:\/\//.test(uri)) return meta
  try {
    const res = await fetch(uri, { signal: AbortSignal.timeout(5_000) })
    const j = (await res.json()) as Record<string, unknown>
    const ext = (j.extensions ?? {}) as Record<string, unknown>
    meta.description = str(j.description)
    meta.imageUrl = str(j.image)
    meta.website = str(ext.website) ?? str(j.website) ?? str(j.external_url)
    meta.twitter = str(ext.twitter) ?? str(j.twitter)
    meta.telegram = str(ext.telegram) ?? str(j.telegram)
  } catch {
    // Unreachable JSON is common right after launch; name/symbol still index.
  }
  return meta
}
