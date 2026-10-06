import type { Metadata } from 'next'
import Link from 'next/link'
import { C, CodeBlock } from '@/components/docs/api/code-block'
import { Callout, DocSection, EndpointList, SubHeading, type Endpoint } from '@/components/docs/api/endpoints'
import { CURL_READS, ERROR_SHAPE, OWN_MINT, QUICKSTART, RPC_CURL, WS_CLIENT } from '@/components/docs/api/snippets'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'API',
  description:
    'Spawn tokens and trade on The Hatchery programmatically: the public REST API, transaction building, the RPC proxy and the live WebSocket feed.',
}

const BASE = 'https://api.thehatchery.site'
const WS = 'wss://api.thehatchery.site/ws'
const SITE = 'https://thehatchery.site'

const TOC = [
  ['overview', 'Overview'],
  ['quickstart', 'Quickstart'],
  ['launch', 'Spawn flow'],
  ['trade', 'Trading'],
  ['reference', 'Reference'],
  ['realtime', 'WebSocket'],
  ['fees', 'Fees & lifecycle'],
  ['errors', 'Errors & limits'],
  ['safety', 'Safety'],
] as const

const CONFIG: Endpoint[] = [
  {
    method: 'GET',
    path: '/config',
    returns: <C>LaunchpadConfigDTO</C>,
    notes: (
      <>
        Cluster, DBC config, quote token (<C>mint</C>, <C>symbol</C>, <C>decimals</C>, <C>name</C>, <C>logoUrl</C>),{' '}
        <C>fees</C> in bps (<C>tradeFeeBps</C>, <C>creatorBps</C>, <C>platformBps</C>, <C>protocolBps</C>,{' '}
        <C>reflectionBps</C>), <C>curve.migrationQuoteThreshold</C>, token supply/decimals, <C>treasury</C>,{' '}
        <C>feeClaimer</C>, <C>featuredMints</C>, <C>officialMint</C>. Cached 60 s.
      </>
    ),
  },
  {
    method: 'GET',
    path: '/stats',
    returns: <C>PlatformStatsDTO</C>,
    notes: (
      <>
        <C>tokens</C>, <C>graduated</C>, <C>volume24hQuote</C>, <C>creatorEarnedTotalQuote</C>,{' '}
        <C>reflectedTotalQuote</C>, <C>quoteUsd</C>.
      </>
    ),
  },
]

const TOKENS: Endpoint[] = [
  {
    method: 'GET',
    path: '/tokens',
    params: (
      <>
        <C>sort</C> new|volume|mcap|progress|lastTrade (new), <C>status</C> CURVE|COMPLETE|MIGRATED, <C>q</C> (name,
        symbol or exact mint, ≤64), <C>creator</C>, <C>limit</C> ≤100 (30), <C>cursor</C>
      </>
    ),
    returns: (
      <>
        <C>{'{ items: TokenDTO[], nextCursor }'}</C>
      </>
    ),
    notes: (
      <>
        <C>sort=progress</C> only lists CURVE tokens unless you pass <C>status</C>.
      </>
    ),
  },
  {
    method: 'GET',
    path: '/tokens/:mint',
    returns: <C>TokenDTO</C>,
    notes: (
      <>
        Price, market cap, <C>progress</C> (0..1), <C>status</C>, <C>quoteReserve</C>, 24h stats, holders,{' '}
        <C>feesTotalQuote</C>, <C>creatorEarnedQuote</C>, <C>reflectedTotalQuote</C>, <C>pendingReflectionQuote</C>.
        404 if unknown.
      </>
    ),
  },
  {
    method: 'GET',
    path: '/tokens/:mint/trades',
    params: (
      <>
        <C>limit</C> ≤200 (50), <C>cursor</C>
      </>
    ),
    returns: <C>Paginated&lt;TradeDTO&gt;</C>,
    notes: (
      <>
        Newest first. <C>venue</C> is DBC (curve) or DAMM_V2 (graduated).
      </>
    ),
  },
  {
    method: 'GET',
    path: '/tokens/:mint/candles',
    params: (
      <>
        <C>tf</C> 1m|5m|15m|1h|4h|1d (5m), <C>from</C>, <C>to</C> (unix s), <C>limit</C> ≤1000 (500)
      </>
    ),
    returns: (
      <>
        <C>{'{ timeframe, items: CandleDTO[] }'}</C>
      </>
    ),
    notes: 'Ascending. OHLC in quote per token; empty list (not 404) for unknown mints.',
  },
  {
    method: 'GET',
    path: '/tokens/:mint/holders',
    params: (
      <>
        <C>limit</C> ≤200 (50)
      </>
    ),
    returns: <C>HolderDTO[]</C>,
    notes: (
      <>
        <C>share</C> is 0..1 of total supply; <C>label</C> marks the curve, graduated pool, platform and creator.
      </>
    ),
  },
  {
    method: 'GET',
    path: '/tokens/:mint/reflections',
    params: (
      <>
        <C>limit</C> ≤100 (20), <C>cursor</C>
      </>
    ),
    returns: <C>Paginated&lt;ReflectionEpochDTO&gt;</C>,
    notes: (
      <>
        One row per fee claim: <C>claimedQuote</C>, <C>creatorQuote</C>, <C>platformQuote</C>,{' '}
        <C>holdersQuote</C>, <C>distributedQuote</C>, <C>carriedQuote</C>, <C>recipients</C>,{' '}
        <C>claimSignatures</C>. Holder fields are 0 while reflections are off.
      </>
    ),
  },
  {
    method: 'GET',
    path: '/trades/recent',
    params: (
      <>
        <C>limit</C> ≤50 (20)
      </>
    ),
    returns: <C>TradeDTO[]</C>,
    notes: 'All tokens, newest first. A plain array, not paginated.',
  },
]

const WALLETS: Endpoint[] = [
  {
    method: 'GET',
    path: '/wallets/:address/earnings',
    params: (
      <>
        <C>mint</C> (optional filter)
      </>
    ),
    returns: <C>WalletEarningsResponse</C>,
    notes: (
      <>
        Creator side: <C>creatorTotalQuote</C> and <C>created</C> per token launched. Holder side: <C>totalQuote</C>{' '}
        and per-token <C>tokens</C>. Confirmed payouts only.
      </>
    ),
  },
  {
    method: 'GET',
    path: '/wallets/:address/reflections',
    params: (
      <>
        <C>limit</C> ≤100 (30), <C>cursor</C>
      </>
    ),
    returns: (
      <>
        <C>Paginated&lt;ReflectionPayoutDTO&gt;</C> + <C>totalQuote</C>
      </>
    ),
    notes: (
      <>
        Every holder reflection payout received, with its transaction <C>signature</C>.
      </>
    ),
  },
  {
    method: 'GET',
    path: '/wallets/:address/trades',
    params: (
      <>
        <C>limit</C> ≤100 (30), <C>cursor</C>
      </>
    ),
    returns: <C>Paginated&lt;TradeDTO&gt;</C>,
  },
  {
    method: 'GET',
    path: '/wallets/:address/claimable',
    returns: <C>ClaimableDTO</C>,
    notes: (
      <>
        Holder reflections owed but not sent yet: <C>claimableQuote</C>, <C>accruedQuote</C>, <C>claimedQuote</C>,{' '}
        <C>pending</C>, <C>minClaimQuote</C>. Only relevant when reflections are on.
      </>
    ),
  },
  {
    method: 'POST',
    path: '/claims/build',
    params: <C>{'{ owner }'}</C>,
    returns: <C>ClaimBuildResponse</C>,
    notes: 'Early withdrawal of claimable reflections: a vault-signed transaction the owner signs as fee payer. 503 if claims are not enabled.',
  },
  {
    method: 'POST',
    path: '/claims/:id/confirm',
    params: <C>{'{ signature }'}</C>,
    returns: <C>{'{ status }'}</C>,
    notes: 'LANDED, or 202 PENDING if the transaction is not visible yet.',
  },
]

const LAUNCH: Endpoint[] = [
  {
    method: 'POST',
    path: '/launch/metadata',
    params: (
      <>
        <C>name</C>, <C>symbol</C>, <C>image</C>, <C>description?</C>, <C>website?</C>, <C>twitter?</C>,{' '}
        <C>telegram?</C>
      </>
    ),
    returns: <C>{'{ uri, imageUrl }'}</C>,
    notes: 'Pins the image and Metaplex JSON to IPFS. 20 uploads per hour per IP.',
  },
  {
    method: 'POST',
    path: '/launch/build',
    params: (
      <>
        <C>creator</C>, <C>name</C>, <C>symbol</C>, <C>uri</C>, <C>mint?</C>, <C>description?</C>, <C>website?</C>,{' '}
        <C>twitter?</C>, <C>telegram?</C>, <C>imageUrl?</C>, <C>firstBuy?</C>
      </>
    ),
    returns: (
      <>
        <C>BuiltTransaction</C> + <C>mint</C>, <C>mintSigned</C>
      </>
    ),
    notes: 'Creator is fee payer. Simulated before it is returned.',
  },
]

const TRADE: Endpoint[] = [
  {
    method: 'GET',
    path: '/trade/quote',
    params: (
      <>
        <C>mint</C>, <C>side</C>, <C>amount</C>, <C>payWith</C>, <C>slippageBps</C> (query string)
      </>
    ),
    returns: <C>TradeQuote</C>,
    notes: 'Read-only. Shares the 60/min transaction-build limit.',
  },
  {
    method: 'POST',
    path: '/trade/build',
    params: (
      <>
        same as quote + <C>owner</C> (JSON body)
      </>
    ),
    returns: <C>BuiltTransaction</C>,
    notes: 'Owner is fee payer. Simulated before it is returned (except split pre-transaction flows).',
  },
]

const OTHER: Endpoint[] = [
  {
    method: 'POST',
    path: '/rpc',
    params: 'JSON-RPC 2.0 request or batch (≤20)',
    returns: 'Upstream JSON-RPC response',
    notes: '300 requests/min per IP. Allowlisted methods only (below).',
  },
  {
    method: 'WS',
    path: WS,
    params: (
      <>
        <C>subscribe</C> / <C>unsubscribe</C> / <C>ping</C>
      </>
    ),
    returns: <C>WsServerMessage</C>,
    notes: 'See WebSocket below.',
  },
  {
    method: 'GET',
    path: '/health',
    returns: <C>{'{ ok, db, redis, indexerLagSeconds }'}</C>,
    notes: '503 when the database or cache is down. indexerLagSeconds is how stale indexed data may be.',
  },
]

const RPC_METHODS = [
  'sendTransaction',
  'simulateTransaction',
  'getLatestBlockhash',
  'getSignatureStatuses',
  'getBalance',
  'getAccountInfo',
  'getMultipleAccounts',
  'getTokenAccountsByOwner',
  'getTokenAccountBalance',
  'getSlot',
  'getBlockHeight',
  'getEpochInfo',
  'getFeeForMessage',
  'getGenesisHash',
  'getVersion',
  'getMinimumBalanceForRentExemption',
  'getRecentPrioritizationFees',
  'isBlockhashValid',
]

const ERRORS: [string, string][] = [
  ['400', 'Validation failed. details is a list of { path, message } per field. Also amounts that round to zero.'],
  ['404', 'Unknown token or route, or the pool is not on chain yet.'],
  ['409', 'Mint address already in use, or the curve is complete and graduating (trading pauses until DAMM v2).'],
  ['413', 'Request body over 6 MB (the metadata image).'],
  ['422', 'Simulation failed (slippage, balance, missing SOL for fees), not enough liquidity, or route too large for one transaction. error is human-readable; details.logs holds the last program logs.'],
  ['429', 'Rate limited. Read the RateLimit and RateLimit-Policy headers and back off.'],
  ['502', 'Upstream failure: Jupiter had no route, or IPFS pinning failed. Usually safe to retry.'],
  ['503', 'A dependency is down (uploads not configured, database or cache unavailable).'],
]

const LIMITS: [string, string][] = [
  ['Every endpoint', '600 / min / IP'],
  ['/launch/build, /trade/build, /trade/quote', '60 / min / IP'],
  ['/launch/metadata', '20 / hour / IP'],
  ['/rpc', '300 / min / IP'],
]

const THEAD =
  'border-b border-[#2c2925] bg-steel-dark/70 font-display text-[10px] uppercase tracking-[0.16em] kit-stencil'

function Table({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="kit-well overflow-hidden">
      <table className="w-full table-fixed text-left text-[13px] leading-snug">
        <thead className={THEAD}>
          <tr>
            <th className="w-[38%] px-3 py-1.5 font-bold sm:w-1/3">{head[0]}</th>
            <th className="px-3 py-1.5 font-bold">{head[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2c2925]">
          {rows.map(([a, b]) => (
            <tr key={a} className="align-top">
              <td className="px-3 py-1.5 font-mono text-[12px] text-phosphor-bright [overflow-wrap:anywhere]">{a}</td>
              <td className="px-3 py-1.5 text-muted-foreground [overflow-wrap:anywhere]">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ApiDocsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <Card title="Comms Terminal" leds={['blue', 'green', 'green']} className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Developers</Badge>
          <Badge variant="cyan">REST + WebSocket</Badge>
        </div>
        <h1 className="mt-3 kit-title text-2xl sm:text-3xl">
          <span className="text-[#ffd98a]">The Hatchery</span> API
        </h1>
        <p className="mt-2 text-base leading-snug text-muted-foreground">
          Spawn tokens, quote and trade, and stream live activity from your own scripts and bots. The server builds
          unsigned Solana transactions; you sign them locally and send them.
        </p>
        <nav aria-label="On this page" className="mt-5 flex flex-wrap gap-1.5">
          {TOC.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="kit-well px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.12em] kit-amber transition-[filter] hover:brightness-125"
            >
              {label}
            </a>
          ))}
        </nav>
      </Card>

      <div className="flex flex-col gap-6">
        <DocSection id="overview" title="Overview" leds={['blue', 'green']}>
          <dl className="kit-well grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 px-3 py-2 text-sm">
            <dt className="font-display text-[11px] font-bold uppercase tracking-[0.12em] kit-stencil">Base URL</dt>
            <dd className="font-mono text-[13px] break-all kit-amber">{BASE}</dd>
            <dt className="font-display text-[11px] font-bold uppercase tracking-[0.12em] kit-stencil">WebSocket</dt>
            <dd className="font-mono text-[13px] break-all kit-amber">{WS}</dd>
            <dt className="font-display text-[11px] font-bold uppercase tracking-[0.12em] kit-stencil">Format</dt>
            <dd>JSON in and out. Amounts are decimal strings in UI units.</dd>
            <dt className="font-display text-[11px] font-bold uppercase tracking-[0.12em] kit-stencil">Auth</dt>
            <dd>None. Every endpoint is public and rate limited per IP.</dd>
            <dt className="font-display text-[11px] font-bold uppercase tracking-[0.12em] kit-stencil">Chain</dt>
            <dd>Solana mainnet. Pools are Meteora Dynamic Bonding Curve, then DAMM v2.</dd>
          </dl>
          <p>
            The quote token is <strong className="kit-cyan">$BITCOIN on Solana</strong>: the quote mint (see{' '}
            <C>GET /config</C>, <C>quote.mint</C>). Fees, prices, reserves and payouts are all in $BITCOIN. Buys can be
            paid in SOL (a Jupiter SOL→$BITCOIN leg inside the same transaction) or in $BITCOIN directly (
            <C>payWith: &apos;QUOTE&apos;</C>). The quote mint may be a legacy SPL Token or a Token-2022 mint; the
            built transactions handle either, so read <C>quote.decimals</C> rather than assuming them.
          </p>
          <Callout tone="warn">
            <strong className="text-amber">CORS:</strong> browsers only allow REST calls from The Hatchery&apos;s own
            origins. Server-side code, scripts and bots are not affected. A web app on another origin must call the API
            from its own backend. The WebSocket accepts any origin.
          </Callout>
        </DocSection>

        <DocSection id="quickstart" title="Quickstart">
          <p>
            One file that spawns a token (with an optional first buy) and buys an existing one. Node 18+,{' '}
            <C>@solana/web3.js</C> v1, and a funded keypair file from <C>solana-keygen new -o wallet.json</C>. It needs
            SOL for the launch rent, network fees and the first buy.
          </p>
          <CodeBlock code={QUICKSTART} title="hpospad.ts" />
          <p>
            The token page appears at <C>{`${SITE}/token/<mint>`}</C> a few seconds after the launch confirms, once the
            indexer has picked it up. Read-only calls need nothing but HTTP:
          </p>
          <CodeBlock code={CURL_READS} title="shell" />
        </DocSection>

        <DocSection id="launch" title="Spawn flow">
          <SubHeading>1. Upload metadata</SubHeading>
          <p>
            <C>POST /launch/metadata</C> pins the image and the Metaplex JSON to IPFS and returns{' '}
            <C>{'{ uri, imageUrl }'}</C>. The metadata is immutable once the token is spawned.
          </p>
          <ul className="list-disc space-y-0.5 pl-5 marker:text-phosphor">
            <li>
              <C>image</C>: base64 <C>data:</C> URL, png, jpg, gif or webp, ≤4 MB decoded. The format is detected from
              the file bytes; the declared MIME type is ignored.
            </li>
            <li>
              <C>name</C>: ≤32 bytes UTF-8. <C>symbol</C>: ≤10 bytes, letters and digits; a leading <C>$</C> is
              stripped and it is upper-cased.
            </li>
            <li>
              <C>description</C> ≤1000 chars. <C>website</C>, <C>twitter</C>, <C>telegram</C>: <C>https://</C> links,
              ≤200 chars, empty string means none.
            </li>
          </ul>

          <SubHeading>2. Build the spawn transaction</SubHeading>
          <p>
            <C>POST /launch/build</C> with <C>creator</C> (your wallet), the same <C>name</C>, <C>symbol</C> and
            socials, the <C>uri</C> (and <C>imageUrl</C>) from step 1, and optionally{' '}
            <C>{"firstBuy: { amount, payWith: 'SOL' | 'QUOTE', slippageBps }"}</C>. The first buy lands atomically with
            pool creation, so nobody can buy before the creator.
          </p>
          <p>
            Omit <C>mint</C>: the server assigns a vanity address ending in <C>hpos</C> from its pool (a random
            address if the pool is empty), signs for it, and returns <C>mintSigned: true</C>. You sign only with the
            creator wallet. Each vanity address is handed out once; the same creator retrying within 10 minutes gets
            the same address back.
          </p>
          <CodeBlock
            code={`{ "transaction": "<base64 v0 tx>", "lastValidBlockHeight": 429320148,
  "mint": "…hpos", "mintSigned": true,
  "quote": { "inAmount": "0.1", "outAmount": "…", "minOut": "…", "feeQuote": "…",
             "priceImpactPct": 0, "route": "SOL > $BITCOIN (Jupiter) > Meteora DBC" },
  "preTransactions": ["<base64 v0 tx>"] }`}
            title="response"
          />
          <p>
            To use your own mint (for example a vanity address you ground yourself), pass its public key as{' '}
            <C>mint</C>. The response has <C>mintSigned: false</C> and you must sign with both keypairs. The build
            fails with 409 if that address already exists on chain.
          </p>
          <CodeBlock code={OWN_MINT} title="own mint" />

          <SubHeading id="pretransactions">3. Sign, send, confirm</SubHeading>
          <p>
            Deserialize with <C>VersionedTransaction.deserialize</C>, sign with your wallet, send, and confirm. If the
            response has <C>preTransactions</C>, sign, send and{' '}
            <strong className="text-foreground">confirm each one first</strong>, in order, and only then send{' '}
            <C>transaction</C>. This happens when a SOL leg does not fit in one transaction: the SOL→$BITCOIN swap lands
            first, then the create + first buy spends exactly what the swap guaranteed. The main transaction cannot be
            simulated before its pre-transaction lands, so the server only size-checks it.
          </p>
          <Callout>
            If the main transaction expires (past <C>lastValidBlockHeight</C>) while you wait, call the build endpoint
            again for a fresh one. Do not re-send a pre-transaction that already confirmed.
          </Callout>
        </DocSection>

        <DocSection id="trade" title="Trading">
          <p>
            <C>GET /trade/quote</C> (query string) and <C>POST /trade/build</C> (JSON body, plus <C>owner</C>) take the
            same fields:
          </p>
          <ul className="list-disc space-y-0.5 pl-5 marker:text-phosphor">
            <li>
              <C>side</C>: <C>BUY</C> or <C>SELL</C>.
            </li>
            <li>
              <C>amount</C>: a decimal string in UI units of what you pay in. For buys that is SOL or $BITCOIN (per{' '}
              <C>payWith</C>); for sells it is the token. Digits beyond the asset&apos;s decimals are truncated (SOL 9,
              the quote per <C>quote.decimals</C>, tokens 6).
            </li>
            <li>
              <C>payWith</C>: <C>SOL</C> or <C>QUOTE</C> ($BITCOIN). For sells it is what you receive.
            </li>
            <li>
              <C>slippageBps</C>: 10 to 5000, default 300 (3%).
            </li>
          </ul>
          <p>
            The quote is a <C>TradeQuote</C>: <C>inAmount</C>, <C>outAmount</C>, <C>minOut</C> (after slippage),{' '}
            <C>feeQuote</C> ($BITCOIN), <C>priceImpactPct</C> and a readable <C>route</C>. Sending the built transaction
            works exactly like a spawn, including <C>preTransactions</C> (for sells paid out in SOL, the curve sell
            lands first and the $BITCOIN→SOL swap second).
          </p>
          <ul className="list-disc space-y-0.5 pl-5 marker:text-phosphor">
            <li>
              <strong className="text-foreground">Filling the curve.</strong> A buy larger than what is left on the
              curve is built as a partial fill: it buys exactly the remainder, which completes the curve, and the
              unused amount stays in your wallet. The <C>route</C> says so and <C>inAmount</C> shows the amount actually
              spent.
            </li>
            <li>
              <strong className="text-foreground">Graduating.</strong> While <C>status</C> is <C>COMPLETE</C>, quotes
              and builds return 409 until migration finishes.
            </li>
            <li>
              <strong className="text-foreground">Graduated.</strong> Once <C>status</C> is <C>MIGRATED</C>, trades
              route entirely through Jupiter (the DAMM v2 pool is indexed there). <C>feeQuote</C> reads <C>0</C> in
              that case, but the pool still charges its trading fee.
            </li>
          </ul>
        </DocSection>

        <DocSection id="reference" title="Endpoint reference" leds={['blue', 'green']}>
          <p>
            Paginated lists return <C>{'{ items, nextCursor }'}</C>; pass <C>nextCursor</C> back as <C>cursor</C> until
            it is <C>null</C>. Defaults are in parentheses. Path params (<C>:mint</C>, <C>:address</C>) must be valid
            base58 Solana addresses.
          </p>
          <SubHeading>Config &amp; stats</SubHeading>
          <EndpointList items={CONFIG} />
          <SubHeading>Tokens</SubHeading>
          <EndpointList items={TOKENS} />
          <SubHeading>Wallets &amp; claims</SubHeading>
          <EndpointList items={WALLETS} />
          <SubHeading>Spawn</SubHeading>
          <EndpointList items={LAUNCH} />
          <SubHeading>Trade</SubHeading>
          <EndpointList items={TRADE} />
          <SubHeading id="rpc">RPC proxy, WebSocket, health</SubHeading>
          <EndpointList items={OTHER} />
          <p>
            <C>POST /rpc</C> forwards to a private mainnet RPC, so you can send and confirm without your own provider.
            It is HTTP only: there are no websocket subscriptions, so <C>confirmTransaction</C> will not work; poll{' '}
            <C>getSignatureStatuses</C> instead (as the quickstart does). Other methods return 403 with a JSON-RPC{' '}
            <C>-32601</C> error. Allowed methods:
          </p>
          <div className="flex flex-wrap gap-1">
            {RPC_METHODS.map((m) => (
              <code key={m} className="kit-well px-1.5 font-mono text-[11.5px] text-phosphor-bright/90">
                {m}
              </code>
            ))}
          </div>
          <CodeBlock code={RPC_CURL} title="shell" />
        </DocSection>

        <DocSection id="realtime" title="WebSocket">
          <p>
            Connect to <C>{WS}</C> and send <C>{"{ op: 'subscribe', topics: [...] }"}</C>. Up to 50 topics per socket;
            unknown topics are ignored. Send <C>{"{ op: 'ping' }"}</C> every 25 s to keep the connection open; the
            server replies <C>{"{ op: 'pong' }"}</C> and drops sockets that stop responding.
          </p>
          <div className="kit-well overflow-hidden">
            <table className="w-full table-fixed text-left text-[13px] leading-snug">
              <thead className={THEAD}>
                <tr>
                  <th className="w-[38%] px-3 py-1.5 font-bold sm:w-1/3">Topic</th>
                  <th className="px-3 py-1.5 font-bold">Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2c2925] text-muted-foreground">
                <tr className="align-top">
                  <td className="px-3 py-1.5 font-mono text-[12px] text-phosphor-bright">trades</td>
                  <td className="px-3 py-1.5 [overflow-wrap:anywhere]">
                    <C>trade</C> for every token: <C>{'{ trade: TradeDTO, token }'}</C> with the token&apos;s new price,
                    market cap, progress and status.
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="px-3 py-1.5 font-mono text-[12px] text-phosphor-bright">tokens</td>
                  <td className="px-3 py-1.5 [overflow-wrap:anywhere]">
                    <C>token:new</C> and <C>token:update</C>, each with a full <C>TokenDTO</C>.
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="px-3 py-1.5 font-mono text-[12px] text-phosphor-bright [overflow-wrap:anywhere]">
                    token:&lt;mint&gt;
                  </td>
                  <td className="px-3 py-1.5 [overflow-wrap:anywhere]">
                    That token&apos;s <C>trade</C>, <C>token:update</C> and, when holder reflections are on,{' '}
                    <C>reflection</C> (<C>{'{ mint, epochId, distributedQuote, recipients }'}</C>).
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Messages from the server are <C>{'{ op: "event", topic, event }'}</C>, <C>{'{ op: "pong" }'}</C> or{' '}
            <C>{'{ op: "error", message }'}</C>.
          </p>
          <CodeBlock code={WS_CLIENT} title="ws.ts" />
        </DocSection>

        <DocSection id="fees" title="Fees & lifecycle" leds={['amber', 'green']}>
          <Callout>
            Read fees and thresholds from <C>GET /config</C> at runtime rather than hardcoding them. The values below are
            the defaults; an operator can change the split (not the total) later.
          </Callout>
          <Table
            head={['Parameter', 'Default']}
            rows={[
              ['fees.tradeFeeBps', '160: 1.6% of the quote side of every trade, in $BITCOIN (fixed in the DBC config)'],
              ['fees.creatorBps', '75: 0.75% to the wallet that spawned the token'],
              ['fees.platformBps', '53: 0.53% platform treasury'],
              ['fees.protocolBps', '32: 0.32% Meteora protocol (20% of the fee, fixed)'],
              ['fees.reflectionBps', '0: holder reflections off (taken from the platform share when on)'],
              ['quote', '$BITCOIN on Solana: the quote mint (see GET /config), SPL Token or Token-2022'],
              ['token', '1,000,000,000 supply, 6 decimals, no mint authority'],
              ['curve.migrationQuoteThreshold', '$BITCOIN the curve must raise to graduate; set per deployment'],
            ]}
          />
          <ol className="list-decimal space-y-1 pl-5 marker:font-mono marker:text-phosphor">
            <li>
              <strong className="text-foreground">CURVE.</strong> Trades hit the Meteora Dynamic Bonding Curve.{' '}
              <C>progress</C> is the share of the graduation threshold raised. The site shows it as an evolution stage:
              Larva under 10%, Cocoon 10–66%, Mutating over 66%.
            </li>
            <li>
              <strong className="text-foreground">COMPLETE.</strong> The curve is full and the pool is migrating
              (Hatching). Trading pauses (409) for a short time.
            </li>
            <li>
              <strong className="text-foreground">MIGRATED.</strong> Liquidity moves to a Meteora DAMM v2 pool (
              <C>dammPool</C> on the token) and the LP is permanently locked (Hatched). The same fee and split apply, and
              trades route via Jupiter.
            </li>
          </ol>
          <p>
            Every few minutes the platform claims each token&apos;s fee and splits it in software. The creator share goes
            straight to the <C>creator</C> wallet in $BITCOIN and the platform share to the treasury; each claim is
            published at <C>/tokens/:mint/reflections</C> (<C>creatorQuote</C>, <C>platformQuote</C>) and totals show
            as <C>creatorEarnedQuote</C> on the token and <C>creatorTotalQuote</C> at{' '}
            <C>/wallets/:address/earnings</C>. This works the same before and after graduation.
          </p>
          <p>
            Holder reflections are off by default (<C>reflectionBps: 0</C>). If an operator turns them on, the holder
            share of each claim is paid to every holder pro-rata in $BITCOIN, automatically, with no claim step. Shares
            too small to send carry over and show at <C>GET /wallets/:address/claimable</C>; a holder can withdraw
            them early with <C>POST /claims/build</C> (<C>{'{ owner }'}</C>), signing the vault-signed transaction as
            fee payer and reporting it with <C>{'POST /claims/:id/confirm { signature }'}</C>.
          </p>
        </DocSection>

        <DocSection id="errors" title="Errors & rate limits">
          <p>
            Errors are <C>{'{ error: string, details?: unknown }'}</C> with a 4xx or 5xx status. The <C>/rpc</C> proxy
            is the exception: it answers in JSON-RPC error format.
          </p>
          <CodeBlock code={ERROR_SHAPE} title="examples" />
          <Table head={['Status', 'Meaning']} rows={ERRORS} />
          <SubHeading>Rate limits</SubHeading>
          <p>
            Per IP, fixed windows. Every response carries <C>RateLimit</C> and <C>RateLimit-Policy</C> headers; a 429
            means wait for the window to reset.
          </p>
          <Table head={['Scope', 'Limit']} rows={LIMITS} />
        </DocSection>

        <DocSection id="safety" title="Safety" leds={['red', 'amber']}>
          <ul className="list-disc space-y-1 pl-5 marker:text-amber">
            <li>
              <strong className="text-foreground">Never send a private key to the API.</strong> No endpoint accepts one
              and the server never needs one. You only send public keys; signing happens on your machine.
            </li>
            <li>
              A bot signs whatever the server returns, so check it first: deserialize the transaction and confirm the
              fee payer (<C>message.staticAccountKeys[0]</C>) is your wallet, and compare the <C>quote</C> (
              <C>inAmount</C>, <C>minOut</C>) against what you asked for. Cap trade sizes and slippage in your own code.
            </li>
            <li>
              Use a dedicated hot wallet holding only what the bot needs. Keep the keypair file out of version
              control.
            </li>
            <li>Always double-check the mint address. Anyone can spawn a token with any name and symbol.</li>
          </ul>
          <p className="text-sm">
            New to The Hatchery?{' '}
            <Link href="/docs" className="kit-amber hover:underline">
              How it works
            </Link>{' '}
            covers the product side.
          </p>
        </DocSection>
      </div>
    </div>
  )
}
