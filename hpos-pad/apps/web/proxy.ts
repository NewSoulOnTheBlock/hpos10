import { NextResponse, type NextRequest } from 'next/server'
import { GATE_COOKIE, GATE_NEXT_HEADER, gateToken } from '@/lib/gate'

/** Pre-launch gate (lib/gate.ts): without the password cookie every page renders /soon. */
export async function proxy(request: NextRequest) {
  const password = process.env.SITE_LOCK_PASSWORD
  if (!password) return NextResponse.next()
  if (request.cookies.get(GATE_COOKIE)?.value === (await gateToken(password))) return NextResponse.next()
  const headers = new Headers(request.headers)
  headers.set(GATE_NEXT_HEADER, request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.rewrite(new URL('/soon', request.url), { request: { headers } })
}

export const config = {
  // Pages only: the gate's own form endpoint, Next internals and static assets pass through.
  matcher: ['/((?!api/gate|soon|_next/|hud/|zerg/|maps/|cursors/|icon\\.svg|.*\\.(?:webp|png|jpg|svg|ico|txt|xml)$).*)'],
}
