import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WalletView } from '@/components/wallet/wallet-view'

type Props = { params: Promise<{ address: string }> }

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export const metadata: Metadata = { title: 'Earnings' }

export default async function WalletPage({ params }: Props) {
  const { address } = await params
  if (!BASE58.test(address)) notFound()
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <WalletView address={address} />
    </div>
  )
}
