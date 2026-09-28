/** Raw on-chain integer -> decimal string in UI units, without float loss. */
export function toUi(raw: bigint | string, decimals: number): string {
  const v = typeof raw === 'string' ? BigInt(raw) : raw
  const neg = v < 0n
  const abs = neg ? -v : v
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`
}

/** Decimal string in UI units -> raw integer. Truncates excess precision. */
export function toRaw(ui: string, decimals: number): bigint {
  const s = ui.trim()
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') throw new Error(`not a positive decimal: "${ui}"`)
  const [whole = '0', frac = ''] = s.split('.')
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0')
}

/**
 * Spot price (quote per base, UI units) from a Q64.64 sqrt price, as both
 * Meteora DBC and DAMM v2 store it.
 */
export function priceFromSqrtPrice(sqrtPriceX64: bigint | string, baseDecimals: number, quoteDecimals: number): number {
  const s = Number(typeof sqrtPriceX64 === 'string' ? BigInt(sqrtPriceX64) : sqrtPriceX64) / 2 ** 64
  return s * s * 10 ** (baseDecimals - quoteDecimals)
}
