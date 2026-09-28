# The Hatchery API

Base URL: `https://api.thehatchery.site` in production (`NEXT_PUBLIC_API_URL`, default
`http://localhost:3001` in development). WebSocket: `wss://api.thehatchery.site/ws`.
JSON everywhere; amounts are decimal strings in UI units. No auth; every endpoint is
rate limited per IP. The full developer guide is on the site at `https://thehatchery.site/docs/api`.
All wire types live in `@hpos-pad/shared` (`packages/shared/src/dto.ts`, `ws.ts`).
Errors: `{ "error": string, "details"?: unknown }` with a 4xx/5xx status.

The quote token is **HPOS10I** on Solana: the quote mint (see `GET /config`,
`quote.mint`; legacy SPL Token or Token-2022). Fees, prices, reserves and payouts are in
HPOS10I. Read fees and the graduation threshold from `/config` rather than hardcoding
them. Defaults:

```json
{
  "fees": { "tradeFeeBps": 160, "creatorBps": 75, "platformBps": 53, "protocolBps": 32, "reflectionBps": 0 },
  "curve": { "migrationQuoteThreshold": "<HPOS10I to graduate, set per deployment>" }
}
```

1.6% per trade = 0.75% to the token's creator + 0.53% platform + 0.32% Meteora protocol
(fixed 20% of the fee). Holder reflections are off (`reflectionBps: 0`); an operator can
turn them on with `REFLECTION_BPS > 0`, and holders are then paid pro-rata.

## Read

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok, db, redis, indexerLagSeconds }` |
| GET | `/config` | | `LaunchpadConfigDTO` |
| GET | `/stats` | | `PlatformStatsDTO` |
| GET | `/tokens` | `sort=new\|volume\|mcap\|progress\|lastTrade`, `status=CURVE\|COMPLETE\|MIGRATED`, `q`, `creator`, `limit<=100`, `cursor` | `TokenListResponse` |
| GET | `/tokens/:mint` | | `TokenDTO` (404 if unknown) |
| GET | `/tokens/:mint/trades` | `limit<=200`, `cursor` | `Paginated<TradeDTO>` |
| GET | `/tokens/:mint/candles` | `tf=1m\|5m\|15m\|1h\|4h\|1d`, `from`, `to` (unix s), `limit<=1000` | `CandleListResponse` (ascending) |
| GET | `/tokens/:mint/holders` | `limit<=200` | `HolderDTO[]` |
| GET | `/tokens/:mint/reflections` | `limit<=100`, `cursor` | `Paginated<ReflectionEpochDTO>` (one row per fee claim: creator, platform and holder shares) |
| GET | `/trades/recent` | `limit<=50` | `TradeDTO[]` (all tokens, newest first) |
| GET | `/wallets/:address/reflections` | `limit<=100`, `cursor` | `Paginated<ReflectionPayoutDTO>` + `totalQuote` |
| GET | `/wallets/:address/earnings` | `mint` (optional) | `WalletEarningsResponse` (creator share per token spawned, and reflections received) |
| GET | `/wallets/:address/trades` | `limit`, `cursor` | `Paginated<TradeDTO>` |
| GET | `/wallets/:address/claimable` | | `ClaimableDTO` (unsent holder reflections) |

## Spawn (launch)

1. `POST /launch/metadata` body `MetadataUploadRequest` -> `MetadataUploadResponse`.
   Pins the image and the Metaplex JSON to IPFS. Rate limited (20/hour/IP).
2. `POST /launch/build` body `LaunchBuildRequest` -> `BuiltTransaction` + `mint`, `mintSigned`.
   The creator wallet is the fee payer. Omit `mint` and the server assigns a vanity
   address ending in `hpos` (or a random one if the pool is empty) and signs for it
   (`mintSigned: true`); the wallet signs and sends. To bring your own mint, pass its
   public key and co-sign with the mint keypair (`mintSigned: false`).
   An optional `firstBuy: { amount, payWith: 'SOL' | 'QUOTE', slippageBps }` lands
   atomically with pool creation. If the response has `preTransactions`, send and confirm
   each first, in order. The server records a `LaunchDraft` so the indexer attaches
   socials/description.

## Trade

`payWith=SOL` routes SOL<->HPOS10I through Jupiter inside the same transaction;
`payWith=QUOTE` pays (or receives) HPOS10I directly.
After graduation (`status=MIGRATED`) trades route entirely through Jupiter.

| Method | Path | Body/Query | Returns |
|---|---|---|---|
| GET | `/trade/quote` | `TradeQuoteRequest` as query | `TradeQuote` |
| POST | `/trade/build` | `TradeBuildRequest` | `BuiltTransaction` (owner is fee payer; wallet signs + sends) |

## Claims (only when reflections are on)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/claims/build` | `{ owner }` | `ClaimBuildResponse` (vault-signed; owner signs as fee payer) |
| POST | `/claims/:id/confirm` | `{ signature }` | `{ status }` (`LANDED`, or 202 `PENDING`) |

## WebSocket

`GET /ws` (same host). Send `WsClientMessage`, receive `WsServerMessage`.
Topics: `trades` (every trade), `tokens` (new + updated tokens), `token:<mint>`
(that token's trades, updates, and `reflection` events when reflections are on).
Ping every 25s with `{ "op": "ping" }`.
