// Dev preview only: serves the live TronPad API on :3218 with open CORS and the
// Hatchery fee schedule / quote label patched into /config. Not for production.
// Run: node scripts/preview-proxy.mjs  then  NEXT_PUBLIC_API_URL=http://localhost:3218 pnpm --filter @hpos-pad/web exec next dev -p 3217
// Preview-only: forwards GETs to the live TronPad API with permissive CORS.
import http from 'node:http'
http.createServer(async (req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  if (req.method !== 'GET') { res.writeHead(405, cors); return res.end() }
  try {
    const r = await fetch('https://api.tronpad.xyz' + req.url)
    res.writeHead(r.status, { ...cors, 'content-type': r.headers.get('content-type') ?? 'application/json' })
    if (req.url.startsWith('/config') && r.ok) {
      // Preview only: show the Hatchery's quote label and fee schedule over TronPad's data.
      const c = await r.json()
      c.quote = { ...c.quote, symbol: 'HPOS10I', name: 'HarryPotterObamaSonic10Inu', logoUrl: null }
      c.fees = { tradeFeeBps: 160, protocolBps: 32, reflectionBps: 0, creatorBps: 75, platformBps: 53, claimableBps: 128 }
      c.featuredMints = c.featuredMints ?? []
      return res.end(JSON.stringify(c))
    }
    if (req.url.startsWith('/tokens') && r.ok) {
      // Preview only: TronPad has no life watch, so fake it: DEAD after 24h without a
      // trade, RUGGED for the symbols in PREVIEW_RUG (comma-separated).
      const rug = new Set((process.env.PREVIEW_RUG ?? '').split(',').filter(Boolean).map((x) => x.toUpperCase()))
      // Same gate as the real rule: only a migrated coin with >= 15 holders can rug.
      const rugged = (t) => rug.has(t.symbol?.toUpperCase()) && t.status === 'MIGRATED' && (t.holders ?? 0) >= 15
      // PREVIEW_MOBS=SYM:usd:holders,... graduates those symbols at that market cap and holder
      // count, to show the hatched mobs (a mob needs both to grow, see lib/evolution.ts).
      const mobs = new Map((process.env.PREVIEW_MOBS ?? '').split(',').filter(Boolean).map((x) => { const [k, usd, h] = x.split(':'); return [k.toUpperCase(), { usd: Number(usd), holders: h === undefined ? null : Number(h) }] }))
      const grad = (t) => { const m = mobs.get(t.symbol?.toUpperCase()); return m ? { ...t, status: 'MIGRATED', progress: 1, marketCapUsd: m.usd, holders: m.holders ?? t.holders } : t }
      const life = (t0) => { const t = grad(t0); return {
        ...t,
        lifeState: rugged(t) ? 'RUGGED' : t.lastTradeAt && Date.now() - Date.parse(t.lastTradeAt) > 86_400_000 ? 'DEAD' : 'ALIVE',
        creatorSold: rugged(t) ? 0.92 : 0,
        athMarketCapQuote: t.athMarketCapQuote ?? t.marketCapQuote,
      } }
      const body = await r.json()
      return res.end(JSON.stringify(Array.isArray(body.items) ? { ...body, items: body.items.map(life) } : body.mint ? life(body) : body))
    }
    res.end(Buffer.from(await r.arrayBuffer()))
  } catch (e) { res.writeHead(502, cors); res.end(String(e)) }
}).listen(3218)
