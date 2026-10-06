import { NextResponse, type NextRequest } from 'next/server'
import { GATE_COOKIE, gateToken, safeNext } from '@/lib/gate'

/** Relative Location, so it works the same behind Caddy (no host/scheme guessing). */
const go = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } })

/** The Coming soon form posts here: right password sets the cookie and goes on, wrong one goes back. */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const next = safeNext(form.get('next'))
  const password = process.env.SITE_LOCK_PASSWORD
  if (!password) return go(next)
  if (form.get('password') !== password) return go(`/soon?e=1&next=${encodeURIComponent(next)}`)
  const res = go(next)
  res.cookies.set(GATE_COOKIE, await gateToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
