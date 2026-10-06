/** Display branding only. Never use these labels to identify a mint or build a transaction. */
export const QUOTE_TICKER = '$BITCOIN'

export function quoteDisplaySymbol(symbol?: string): string {
  if (!symbol || /^(?:\$)?(?:HPOS10I|BITCOIN)$/i.test(symbol)) return QUOTE_TICKER
  return symbol
}

/** The API's human-readable route can still contain the legacy quote ticker. */
export function quoteDisplayRoute(route: string): string {
  return route.replace(/\$?\bHPOS10I\b/g, QUOTE_TICKER)
}
