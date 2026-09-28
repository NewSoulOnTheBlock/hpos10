import { PublicKey } from '@solana/web3.js'
import type { LaunchpadConfigDTO } from '@hpos-pad/shared'

type Cluster = LaunchpadConfigDTO['cluster']

function clusterSuffix(cluster: Cluster | undefined): string {
  return cluster === 'devnet' ? '?cluster=devnet' : ''
}

export const solscanTx = (sig: string, cluster?: Cluster) => `https://solscan.io/tx/${sig}${clusterSuffix(cluster)}`
export const solscanAccount = (addr: string, cluster?: Cluster) =>
  `https://solscan.io/account/${addr}${clusterSuffix(cluster)}`
export const solscanToken = (mint: string, cluster?: Cluster) =>
  `https://solscan.io/token/${mint}${clusterSuffix(cluster)}`

export function isValidAddress(value: string): boolean {
  try {
    new PublicKey(value)
    return value.length >= 32 && value.length <= 44
  } catch {
    return false
  }
}

/** Normalize a free-form social input into a URL, or undefined when blank. */
export function normalizeUrl(value: string | undefined, kind: 'website' | 'twitter' | 'telegram'): string | undefined {
  const v = value?.trim()
  if (!v) return undefined
  if (/^https?:\/\//i.test(v)) return v
  const handle = v.replace(/^@/, '')
  if (kind === 'twitter') return `https://x.com/${handle}`
  if (kind === 'telegram') return `https://t.me/${handle}`
  return `https://${v}`
}
