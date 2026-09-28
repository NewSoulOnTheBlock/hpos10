/**
 * Code samples shown on /docs/api. The quickstart is type-checked against
 * @solana/web3.js v1; keep field names in sync with apps/api/src/routes/write.ts.
 */

export const QUICKSTART = `// hpospad.ts: spawn a token and trade on The Hatchery from Node 18+.
//   npm i @solana/web3.js@1
//   npx tsx hpospad.ts launch ./logo.png
//   npx tsx hpospad.ts buy <mint> 0.05
import { readFileSync } from 'node:fs'
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'

const API = 'https://api.thehatchery.site'
// Any mainnet RPC works. The Hatchery's proxy is HTTP only, so we poll for confirmation.
const connection = new Connection(process.env.RPC_URL ?? \`\${API}/rpc\`, 'confirmed')
// A solana-keygen JSON file. The key stays on this machine; the API never sees it.
const wallet = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.KEYPAIR ?? 'wallet.json', 'utf8'))),
)

type PayWith = 'SOL' | 'QUOTE'
type Quote = { inAmount: string; outAmount: string; minOut: string; feeQuote: string; priceImpactPct: number | null; route: string }
type Built = {
  preTransactions?: string[]
  transaction: string
  lastValidBlockHeight: number
  mint?: string
  mintSigned?: boolean
  quote: Quote | null
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(\`\${API}\${path}\`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json: unknown = await res.json()
  if (!res.ok) {
    const e = json as { error?: string; details?: unknown }
    throw new Error(\`\${res.status} \${e.error ?? 'error'} \${e.details ? JSON.stringify(e.details) : ''}\`)
  }
  return json as T
}

async function confirm(signature: string, timeoutMs = 90_000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature])
    const st = value[0]
    if (st?.err) throw new Error(\`\${signature} failed: \${JSON.stringify(st.err)}\`)
    if (st?.confirmationStatus === 'confirmed' || st?.confirmationStatus === 'finalized') return
    await new Promise((r) => setTimeout(r, 1_000))
  }
  throw new Error(\`\${signature} not confirmed in time; build a fresh transaction and retry\`)
}

async function signSendConfirm(b64: string): Promise<string> {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, 'base64'))
  // Adds the wallet's signature; a server-held mint signature is kept.
  tx.sign([wallet])
  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 })
  await confirm(signature)
  return signature
}

/** preTransactions first, in order, each confirmed; then the main transaction. */
async function sendBuilt(built: Built): Promise<string> {
  for (const pre of built.preTransactions ?? []) console.log('pre-transaction', await signSendConfirm(pre))
  return signSendConfirm(built.transaction)
}

async function launch(imagePath: string): Promise<void> {
  const token = {
    name: 'My Token', // <= 32 bytes
    symbol: 'MYTKN', // <= 10, letters and digits
    description: 'Launched from a script',
    website: 'https://example.com', // optional, https only
    twitter: 'https://x.com/example',
  }
  // 1. Pin image + metadata to IPFS. The declared type is ignored; the server reads the bytes.
  const image = \`data:image/png;base64,\${readFileSync(imagePath).toString('base64')}\`
  const meta = await api<{ uri: string; imageUrl: string }>('/launch/metadata', { ...token, image })

  // 2. Build. No \`mint\`: the server assigns a …hpos vanity address and signs for it.
  const built = await api<Built>('/launch/build', {
    creator: wallet.publicKey.toBase58(),
    ...token,
    uri: meta.uri,
    imageUrl: meta.imageUrl,
    firstBuy: { amount: '0.1', payWith: 'SOL' as PayWith, slippageBps: 500 }, // optional
  })
  if (!built.mint || !built.mintSigned) throw new Error('server did not assign a mint')
  console.log('mint', built.mint, 'first buy', built.quote)

  // 3. Sign with the creator wallet only, send, confirm.
  const signature = await sendBuilt(built)
  console.log('spawned', signature)
  console.log(\`https://thehatchery.site/token/\${built.mint}\`)
}

async function buy(mint: string, amountSol: string): Promise<void> {
  const params = { mint, side: 'BUY', amount: amountSol, payWith: 'SOL', slippageBps: '300' }
  const quote = await api<Quote>(\`/trade/quote?\${new URLSearchParams(params)}\`)
  console.log('quote', quote)
  const built = await api<Built>('/trade/build', { ...params, slippageBps: 300, owner: wallet.publicKey.toBase58() })
  console.log('bought', await sendBuilt(built))
}

const [cmd, a, b] = process.argv.slice(2)
const run = cmd === 'launch' && a ? launch(a) : cmd === 'buy' && a && b ? buy(a, b) : null
if (!run) console.log('usage: launch <image> | buy <mint> <sol>')
run?.catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})`

export const CURL_READS = `# Live launchpad parameters (fees, quote mint, graduation threshold)
# Read these at runtime; never hardcode the quote mint or fee split.
curl -s https://api.thehatchery.site/config

# Top 10 tokens still on the curve, by 24h volume
curl -s 'https://api.thehatchery.site/tokens?sort=volume&status=CURVE&limit=10'

# One token, its last 20 trades and 1h candles
curl -s https://api.thehatchery.site/tokens/<mint>
curl -s 'https://api.thehatchery.site/tokens/<mint>/trades?limit=20'
curl -s 'https://api.thehatchery.site/tokens/<mint>/candles?tf=1h&limit=200'

# Quote a 0.05 SOL buy (read-only, nothing is built or signed)
curl -s 'https://api.thehatchery.site/trade/quote?mint=<mint>&side=BUY&amount=0.05&payWith=SOL&slippageBps=300'`

export const OWN_MINT = `// Bring your own mint (e.g. your own vanity grind). You must co-sign with it.
const mintKeypair = Keypair.generate()
const built = await api<Built>('/launch/build', {
  creator: wallet.publicKey.toBase58(),
  mint: mintKeypair.publicKey.toBase58(),
  ...token,
  uri: meta.uri,
  imageUrl: meta.imageUrl,
})
// built.mintSigned === false
const tx = VersionedTransaction.deserialize(Buffer.from(built.transaction, 'base64'))
tx.sign([mintKeypair, wallet])`

export const RPC_CURL = `curl -s https://api.thehatchery.site/rpc -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"getSignatureStatuses","params":[["<signature>"]]}'`

export const WS_CLIENT = `// Browsers, Node 22+ (global WebSocket), or the \`ws\` package on older Node.
const ws = new WebSocket('wss://api.thehatchery.site/ws')
ws.onopen = () => {
  ws.send(JSON.stringify({ op: 'subscribe', topics: ['trades', 'tokens', \`token:\${mint}\`] }))
  setInterval(() => ws.send(JSON.stringify({ op: 'ping' })), 25_000)
}
ws.onmessage = (m) => {
  const msg = JSON.parse(String(m.data))
  if (msg.op !== 'event') return // 'pong' | 'error'
  const e = msg.event
  if (e.type === 'trade') console.log(e.trade.side, e.trade.quoteAmount, e.trade.symbol)
  if (e.type === 'token:new') console.log('new token', e.token.mint)
  // Only emitted when holder reflections are on (fees.reflectionBps > 0 in /config).
  if (e.type === 'reflection') console.log('paid holders', e.distributedQuote, e.mint)
}`

export const ERROR_SHAPE = `// 400: validation (details lists each field)
{ "error": "invalid request", "details": [{ "path": "amount", "message": "amount must be a positive decimal" }] }

// 422: the built transaction failed simulation
{ "error": "price moved beyond your slippage; try again or raise slippage", "details": { "logs": ["…"] } }`
