import type { Metadata, Viewport } from 'next'
import { Chakra_Petch, Oxanium, Share_Tech_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import { GameBar } from '@/components/game-bar'
import './globals.css'
import './kit.css'

const oxanium = Oxanium({ variable: '--font-oxanium', subsets: ['latin'], weight: ['500', '700', '800'], display: 'swap' })
const chakra = Chakra_Petch({ variable: '--font-body', subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' })
const readout = Share_Tech_Mono({ variable: '--font-readout', subsets: ['latin'], weight: '400', display: 'swap' })

const description =
  'Morph a larva into a token on a Meteora bonding curve in one transaction. The creator earns on every trade, before and after graduation.'

export const metadata: Metadata = {
  metadataBase: new URL('https://thehatchery.site'),
  title: { default: 'The Hatchery | Spawn your token', template: '%s | The Hatchery' },
  description,
  openGraph: { title: 'The Hatchery', description, siteName: 'The Hatchery', type: 'website' },
  twitter: { card: 'summary_large_image', site: '@hpos10ireturns', creator: '@hpos10ireturns', title: 'The Hatchery', description },
}

export const viewport: Viewport = {
  themeColor: '#060a0e',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oxanium.variable} ${chakra.variable} ${readout.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          {/* A game, not a website: one HUD bar on top, the screen below it. No footer (the risk notice is in MENU and the Manual). */}
          <div className="flex min-h-dvh flex-col">
            <GameBar />
            <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
