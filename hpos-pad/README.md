# The Hatchery

A Solana token launchpad on **Meteora Dynamic Bonding Curve**, quoted in **HPOS10I**.
Anyone can spawn a token in one transaction; its creator earns a share of every trade it
makes, in HPOS10I, before and after it graduates to a Meteora DAMM v2 pool. Buyers can pay
in SOL (a Jupiter SOL→HPOS10I leg in the same transaction) or in HPOS10I directly.

The quote mint is set by `QUOTE_MINT` (legacy SPL Token and Token-2022 both work; mints
with transfer fees or transfer hooks are refused). Vanity mint addresses end in `hpos`
(`VANITY_SUFFIX`). The site presents each token's real curve progress as an evolution
stage: Larva (<33%), Cocoon (33–66%), Mutating (>66%), Hatching (curve complete,
migrating) and Hive (graduated to DAMM v2).

```
apps/web      Next 16 · React 19 · Tailwind 4 · React Query · wallet-adapter · lightweight-charts
apps/api      Express 5 REST + WebSocket bridge · builds unsigned transactions
apps/chain    indexer (ingestion) + service (reflections, migration, rollups)
packages/db   Prisma schema + DTO mappers
packages/shared  fee math, wire types, WS protocol (used by all three apps)
```

## Fees

One DBC config serves every token. Its trading fee is taken in the quote token on
buys and sells (`collectFeeMode = QuoteToken`), so nothing is ever sold to pay anyone.

| | of each trade | where it goes |
|---|---|---|
| Trader pays | **1.60%** | `TRADE_FEE_BPS=160` (baked into the config, immutable) |
| Meteora | 0.32% | fixed 20% of the fee, taken by the program |
| **Creator** | **0.75%** | `CREATOR_BPS=75`, sent to the wallet that spawned the token |
| Platform | 0.53% | the remainder, sent to `TREASURY` |
| Holders | 0 | `REFLECTION_BPS=0`: reflections off by default |

Meteora always keeps 20% of the total, so the creator/platform/holder split comes out of
the other 80%. Only the total is on-chain; `CREATOR_BPS` and `REFLECTION_BPS` are applied
by the service and can be changed later (the site reads them from `/config`, so the
disclosure stays accurate). Setting `REFLECTION_BPS > 0` turns holder reflections on:
that share is taken from the platform's and paid to holders pro-rata in HPOS10I. The
math lives in `packages/shared/src/fees.ts`.

The config sets `creatorTradingFeePercentage = 0`, so the whole non-protocol fee goes to
the partner (the platform's fee claimer), and the service splits it and pays the creator
share out itself. After graduation the DAMM v2 pool charges the same fee; the platform
owns 100% of the migrated LP (permanently locked), so its LP fees fund the same split
exactly as before.

## How the pieces fit

```
          ┌──────── Yellowstone gRPC / RPC websocket ────────┐
Solana ──►│ chain-indexer: decode Anchor event-CPI            │──► Postgres ◄── api (REST)
          │ EvtInitializePool / EvtSwap2 / EvtCurveComplete   │──► Redis pub/sub ──► api (/ws) ──► web
          └──────── cursor backfill (getSignaturesForAddress) ┘
chain-service (Redis-leased leader): quote price · rollups · holders · migrator · reflector
```

### Indexer, and why it's built this way

- **One filter covers the whole pad.** Every DBC `swap`/`swap2`/`initialize` instruction
  takes the config account, so subscribing to transactions that touch `DBC_CONFIG` catches
  every trade on every token. Graduated DAMM v2 pools are added to the filter as they appear.
- **Events, not logs.** DBC and cp-amm emit Anchor event-CPI (`EvtSwap2` carries amounts,
  fees, post-trade sqrt price, quote reserve and migration threshold). Decoding the inner
  instruction avoids log truncation and extra account reads. `EvtSwap` is emitted alongside
  `EvtSwap2` and is ignored so nothing is double counted.
- **Live stream + cursor backfill.** Yellowstone gRPC (or `logsSubscribe` without it) gives
  low latency; `getSignaturesForAddress` from a stored cursor recovers any gap after a
  restart or a dropped socket. The cursor only moves after a contiguous range is processed.
- **Idempotent, order-safe writes.** Trades are unique on `(signature, eventIndex)`. Price,
  candle open/close and the token's live state are ordered by `slot*1000 + eventIndex`, so
  overlap and out-of-order arrival never double count or rewind a price.

Verified against a live mainnet DBC config: indexed price and quote reserve matched the
on-chain pool state exactly, with zero duplicate trades.

### Fee job (creator payouts and optional reflections)

Every `REFLECT_INTERVAL_MINUTES`, for each token with claimable fees:

1. claim the partner fee (DBC pool, and the LP position after graduation)
2. measure what arrived from the claim transaction's own token-balance delta
3. send the creator share to the token's creator and the platform share to `TREASURY`
4. only if `REFLECTION_BPS > 0`: snapshot holders, allocate the holder share + carry
   pro-rata (integer math) and pay in batches; shares under `REFLECT_MIN_PAYOUT_QUOTE`
   and holders without an HPOS10I account (unless `REFLECT_CREATE_ATAS=true`) roll into
   the token's carry

Every signature is written to the ledger **before** it is broadcast. After a crash the
chain decides what happened: landed batches are kept, dropped ones are retried, nothing is
paid twice. The ledger (`ReflectionEpoch`, `ReflectionPayout`) is public: the token page
and `/wallet/<address>` show every claim and payout (creator, platform and, when on,
holders) with transaction links. The service refuses to distribute if the fee claimer's
balance doesn't cover all outstanding carry.

Excluded from payouts: the curve and DAMM pool authorities (and every other off-curve
PDA), the fee claimer, the treasury, and `REFLECT_EXCLUDE`.

### Graduation

Meteora's keepers only auto-migrate pools whose quote token meets their criteria, which
a small quote token like HPOS10I can't be relied on to meet, and a completed curve that
isn't migrated has trading halted. So the migrator (`MIGRATOR_ENABLED`) graduates every
completed curve to DAMM v2 within ~30 s, withdraws the partner surplus into the token's
fee carry, and switches indexing to the new pool.

### Trading with SOL

Most users hold SOL, not HPOS10I. `payWith=SOL` puts a Jupiter SOL→HPOS10I leg (route
capped with `maxAccounts`) and the DBC swap in **one** v0 transaction; `payWith=QUOTE`
pays in HPOS10I directly. A launch with a first buy in SOL tries the same; if pool
creation + metadata + Jupiter won't fit in 1232 bytes, it returns the SOL→HPOS10I swap
as a `preTransaction` and keeps create + first buy atomic in the
main transaction (the wallet signs both at once). Every built transaction is simulated
before it's returned, so users see a real reason instead of a failed wallet prompt.

## Setup

```bash
pnpm install
cp .env.example .env                  # fill RPC_URL, wallets, PINATA_JWT
cp apps/web/.env.example apps/web/.env.local
pnpm infra:up                         # postgres + redis in docker
pnpm build                            # shared -> db -> apps
pnpm db:push

pnpm config:create                    # validate + simulate the DBC config
pnpm config:create --send             # create it; paste the address into DBC_CONFIG

pnpm dev                              # api :3001, indexer, service, web :3000
```

Fund the fee claimer with SOL (claims, payouts, migrations, and ATA rent if enabled).
Set `QUOTE_MINT` to the HPOS10I mint and verify it before `config:create`: the config's
quote mint can never change afterwards. Size the curve with `INITIAL_MCAP_QUOTE` and
`MIGRATION_MCAP_QUOTE` (in HPOS10I); the resulting graduation threshold is served as
`curve.migrationQuoteThreshold` on `/config`. Put vanity keypairs ending in `hpos` in the
pool with `pnpm vanity:grind <n>` (needs `VANITY_ENCRYPTION_KEY`).

### Production

`docker compose up -d --build` runs postgres, redis, a one-shot schema push, `api`,
`chain-indexer` and `chain-service`. The api is stateless (scale it); the indexer is a
single writer; the service can run replicas safely because a Redis lease elects one
leader to run the jobs that sign transactions. Deploy `apps/web` to Vercel with
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_RPC_URL`.

## Known limits

- Reflections are optional. With them on, push-based payouts cost a transaction per ~10
  holders per epoch; past a few thousand holders per token, move to a claim-based Merkle
  distributor (holders pay their own fees).
- Holders who have never held HPOS10I have no HPOS10I account; their share carries until
  they do, unless `REFLECT_CREATE_ATAS=true` (the platform pays ~0.002 SOL rent each).
- The creator's HPOS10I account is created by the fee claimer on the first payout
  (~0.002 SOL rent, once per creator).
- Not audited. Run on devnet or with small amounts first.
