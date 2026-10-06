/**
 * The pre-launch gate: while SITE_LOCK_PASSWORD is set, every page shows the
 * Coming soon screen (app/soon) until the visitor enters the password. The
 * cookie holds a hash of it, never the password itself. Unset the variable
 * and restart the web container to open the site.
 */
export const GATE_COOKIE = 'hatchery-gate'
/** Header the proxy passes to /soon with the page the visitor asked for. */
export const GATE_NEXT_HEADER = 'x-gate-next'

export async function gateToken(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`hatchery-gate:${password}`))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Only same-site paths, so the form can't be used to bounce visitors elsewhere. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
