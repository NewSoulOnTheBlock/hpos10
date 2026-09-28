import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

/** Accepts a base58 secret key or a JSON byte array, as wallets export them. */
export function parseKeypair(secret: string): Keypair {
  const s = secret.trim()
  const bytes = s.startsWith('[') ? Uint8Array.from(JSON.parse(s) as number[]) : bs58.decode(s)
  if (bytes.length !== 64) throw new Error(`secret key must be 64 bytes, got ${bytes.length}`)
  return Keypair.fromSecretKey(bytes)
}
