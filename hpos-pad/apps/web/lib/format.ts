import { formatDistanceToNowStrict } from 'date-fns'

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })

export function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function formatCompact(value: number | string | null | undefined): string {
  const n = num(value)
  if (n === 0) return '0'
  if (Math.abs(n) < 1) return formatAmount(n)
  return compact.format(n)
}

/** General-purpose amount: keeps small values legible without scientific notation. */
export function formatAmount(value: number | string | null | undefined, maxFrac = 4): string {
  const n = num(value)
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return compact.format(n)
  if (abs >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: Math.min(maxFrac, abs >= 1000 ? 2 : maxFrac) })
  return n.toLocaleString('en-US', { maximumSignificantDigits: 4 })
}

/** Token prices are tiny; show 0.0₅123 style subscript zeros for readability. */
export function formatPrice(value: number | null | undefined): string {
  const n = num(value)
  if (n === 0) return '0'
  if (n >= 0.01) return n.toLocaleString('en-US', { maximumSignificantDigits: 5 })
  const s = n.toFixed(20)
  const m = /^0\.(0+)(\d{1,4})/.exec(s)
  if (!m) return n.toExponential(3)
  const zeros = m[1]!.length
  const digits = m[2]!.replace(/0+$/, '') || '0'
  if (zeros < 4) return `0.${'0'.repeat(zeros)}${digits}`
  const sub = String(zeros)
    .split('')
    .map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)])
    .join('')
  return `0.0${sub}${digits}`
}

export function formatUsd(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (opts.compact !== false && Math.abs(value) >= 10_000) return `$${compact.format(value)}`
  if (Math.abs(value) > 0 && Math.abs(value) < 0.01) return `$${formatPrice(value)}`
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

export function formatQuote(value: number | string | null | undefined, symbol: string, compactValues = true): string {
  return `${compactValues ? formatCompact(value) : formatAmount(value)} ${symbol}`
}

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function bpsToPct(bps: number): string {
  const v = bps / 100
  return `${Number.isInteger(v) ? v : v.toFixed(2)}%`
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 45) return `${Math.max(1, Math.round(s))}s`
  return formatDistanceToNowStrict(d)
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h')
    .replace(/ days?/, 'd')
    .replace(/ months?/, 'mo')
    .replace(/ years?/, 'y')
}

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address
  return `${address.slice(0, chars)}…${address.slice(-chars)}`
}

/** Plain-decimal price for chart axes, where subscript glyphs render poorly. */
export function formatPricePlain(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  if (Math.abs(value) >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return value.toPrecision(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}
