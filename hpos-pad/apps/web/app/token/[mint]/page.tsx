import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { TokenDTO } from '@hpos-pad/shared'
import { TokenView } from '@/components/token/token-view'
import { API_BASE_URL } from '@/lib/constants'

type Props = { params: Promise<{ mint: string }> }

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** "GameStop ($GME) | The Hatchery" via the layout's title template; falls back to the short mint. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mint } = await params
  const fallback = { title: `${mint.slice(0, 4)}…${mint.slice(-4)}` }
  if (!BASE58.test(mint)) return fallback
  try {
    const res = await fetch(`${API_BASE_URL}/tokens/${mint}`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(3_000) })
    if (!res.ok) return fallback
    const t = (await res.json()) as TokenDTO
    const title = `${t.name} ($${t.symbol})`
    const description = t.description || `${t.name} ($${t.symbol}) on The Hatchery: live chart, trades and holders.`
    const images = t.imageUrl ? [{ url: t.imageUrl }] : undefined
    return { title, description, openGraph: { title, description, images }, twitter: { title, description, images } }
  } catch {
    return fallback
  }
}

export default async function TokenPage({ params }: Props) {
  const { mint } = await params
  if (!BASE58.test(mint)) notFound()
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4">
      <TokenView mint={mint} />
    </div>
  )
}
