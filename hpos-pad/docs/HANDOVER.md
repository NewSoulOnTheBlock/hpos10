# The Hatchery (hpos-pad): handover

State as of 2026-09-29, 00:45. Read with `README.md` (architecture) and `docs/API.md`.
The owner speaks Turkish and wants replies in Turkish.

## What it is

A fork of TronPad (`/Users/rez/Desktop/memes/meteoradbc/tronpad`): a Solana
memecoin launchpad on Meteora Dynamic Bonding Curve, rebranded **The Hatchery**
and reskinned as a full-screen StarCraft/Brood War-style RTS game.

- Location: `/Users/rez/Desktop/memes/hpos10/hpos-pad`. It is **not a git repo yet**. Nothing is deployed and no DBC config has been created on-chain.
- Quote token: **HPOS10I**, the Wormhole-bridged mint `CTgiaZUK12kCcB8sosn4Nt2NZtzLgtPqDwyQyr2syATC`.
  - Legacy SPL, **8 decimals**, Jupiter verified.
  - Liquidity is thin: about $48k.
  - Set in `.env.example`.
- Fees: **1.60%** = 0.75% to the creator + 0.53% platform + 0.32% Meteora (a fixed 20% cut).
  - Holder reflections are **off** (`REFLECTION_BPS=0`); the machinery still exists.
  - The owner asked for 0.75/0.5. The exact total would be 156.25 bps, and bps must be an integer, so the rounding went to the platform.
- Curve defaults in `.env.example`: 150k → 2M HPOS10I (about $2.4k → $32.6k at $0.0163). Recompute from the live price before running `config:create`, because the config is immutable.

## Backend changes vs TronPad (apps/chain, apps/api, packages)

- Everything is renamed `@hpos-pad/*`: Redis channel `hpospad:events`, claim memo `hpospad:claim:<id>`, vanity suffix `hpos`.
- Token-2022 quote support.
  - `apps/chain/src/clients/solana.ts` detects the quote program at startup and refuses quote mints with transfer-fee or transfer-hook extensions.
  - The reflector, claim-signer and treasury pass `quoteProgram` to their ATA and transfer calls.
  - `apps/api/src/services/claims.ts` resolves the quote program lazily.
- `splitClaim`: when `reflectionBps === 0` the rounding remainder goes to the platform, and the reflector's `distribute()` skips the holder snapshot.
- `GET /stats` has a new field, `creatorEarnedTotalQuote`.
- Quote-unit thresholds are rescaled for HPOS (e.g. `REFLECT_MIN_CLAIM_QUOTE=200`, `GAS_TOPUP_QUOTE=3000`).
- `pnpm -r typecheck` and `pnpm -r test` both pass (shared 9, chain 2, api 13).

## Frontend (apps/web): the game

### Screens
- `/` **The creep**: `components/creep/creep-map.tsx` with `camera.ts`.
  - An endless tiled map (`public/maps/melancholy-tile.webp`, mirrored so it tiles seamlessly).
  - Camera controls: drag, wheel zoom, WASD/arrows, screen-edge scroll using Brood War cursors, and click/drag on the minimap.
  - Tokens sit on a sunflower spiral from `placeOf(i, mint)`, oldest first, so each spot is stable and new tokens take the outer ring. All pages of tokens load, and only structures inside the viewport render.
  - The platform token (`config.officialMint`) is the big Hive at the origin, with 3 larva draft slots at its feet.
  - Each structure has an always-on `$SYMBOL` label and a segmented HP bar showing curve progress (at least one segment always lit).
  - Structure mapping (`lib/evolution.ts` `structureOf`):

    | State | Structure |
    |---|---|
    | Fresh launch (<30 min old and <5% curve) | egg |
    | Live curve | hatchery |
    | COMPLETE | morphing |
    | MIGRATED | lair |
    | MIGRATED and ≥ $250k market cap | hive |

  - Bottom HUD (UI kit frames):
    - minimap, with F1/F2 tabs and a clock;
    - info panel with control groups 1/2/3 and a green wireframe of the selected structure;
    - portrait;
    - 3×3 command card: Feed (buy), Vomit (sell), Chart, Copy, Morph, Wallet, Swarm, Manual, Cancel.
    - Hotkeys: F V C Y M B L H Esc. WASD belongs to the camera.
  - Top-right notices: "egg laid" and "mutation complete".
  - A Cerebrate briefing on first visit without a wallet.
- `/create` **Morph**: 3 larva draft slots saved in localStorage (`lib/larva.ts`, `?larva=0..2`, read client-side in `components/creep/morph-screen.tsx`). The morph stage shows a larva in a ring → cocoon with a GESTATION n/4 bar → HATCHED, then redirects to `/?hatched=<mint>`.
- `/board` **Swarm list** (Hide creep), `/token/[mint]`, `/wallet/[address]` (creator earnings, Sproto avatar), `/docs`, `/docs/api`.
- Chrome: `components/game-bar.tsx` (top HUD on every page except `/`) and `components/game-menu.tsx` (nav plus the risk notice and the CC BY credit). There is no footer.

### Styling
- `app/globals.css`: base tokens, console/HUD helpers, `.zsprite` sprite-strip animation, `.creep-blot`, cursors.
- `app/kit.css`: the UI-kit primitives (Card = 9-slice of `/hud/info.webp`, buttons = kit plates) and the global amber/green retint. It is imported right after globals.css.
- **Gotcha:** custom classes must sit inside `@layer components`, otherwise they override Tailwind utilities (this has bitten us twice).
- Palette: kit amber `#f0a818`, HPOS yellow `#feeb00`, SC green `#3dff6a`. The owner does not want blue.

### Assets and the scripts that made them (`scripts/`)

| Asset | Source | Script |
|---|---|---|
| `public/hud/*` | `starcraft-ui/ui-kit.svg` (licensed kit) | `hud-kit-crop.py`, `hud-kit-clean.py`, and `hud-resbar.py` (the resource bar with a mirrored right cap) |
| `public/zerg/{hatchery,lair,hive}.webp` | 4-frame strips from `ui-kits/…Zerg Buildings.png` (now only the platform Hive and decor). Player colour (magenta) is recoloured to `#feeb00`. | `zerg-sprites.py` |
| `public/zerg/drone.webp` | Broodling walk cycle, from `…Queen & Broodling.png` | `zerg-units.py` |
| `public/zerg/{larva,curl,egg,prebirth}.webp`, `hatch-*.webp`, `idle-*.webp` | Mobs from `ui-kits/rug.png`: cells auto-detected, green keyed out, magenta → yellow. Frame sizes are mirrored in `STRIPS` in `components/creep/sprites.tsx`. | `zerg-mobs.py` |
| `public/cursors/*` | `ui-kits/…Cursors.png` | `cursors.py` |
| `public/maps/melancholy*.webp` | Melancholy by Alexandre Coderre-Chabot, **CC BY 4.0**. The credit is in the MENU and on /docs. | none |
| `public/sproto-avatars.webp` | 80 Sproto Gremlins cut from the owner's 1500×500 SVG. `components/sproto-avatar.tsx` picks a deterministic avatar per wallet: character × logo-palette background × pattern × flip. | `sproto-tiles.py` |
| `public/hpos10i.webp` | HPOS10I logo (quote icon) | none |

- `components/creep/sprites.tsx` has `STRIPS`, which records each strip's frame size, frame count and fps. `AnimatedSprite name=…` plays a strip.
- The Python scripts expect a venv with Pillow, numpy and scipy, plus Ghostscript/poppler (`brew install poppler`). Source files are under `/Users/rez/Desktop/memes/hpos10/starcraft-ui/`.
- IP note, raised once; the owner decided to proceed: the `ui-kits/*` sheets are Spriters-Resource rips of Brood War, so they are Blizzard art. Don't re-raise it.

## Running a preview

```bash
cd /Users/rez/Desktop/memes/hpos10/hpos-pad && pnpm install
node scripts/preview-proxy.mjs &      # :3218, live TronPad API with CORS and the Hatchery /config patch
cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:3218 NEXT_PUBLIC_WS_URL=ws://localhost:1/ws npx next dev -p 3217
```

- Port 3100 is taken, probably by tronpad's own dev server.
- The TronPad API only allows CORS from localhost:3100, which is why the proxy exists.
- Preview data is TronPad's own tokens (TRX amounts shown under the HPOS label). This is expected.
- Screenshots: headless Chrome (`--headless=new --virtual-time-budget=12000 --screenshot=…`).
  - rAF animations don't advance in headless.
  - The briefing overlay covers the map. To screenshot the map, temporarily swap `useSyncExternalStore(subscribeBriefing, readBriefed, () => true)` for `true` in creep-map, then restore it.

## Life watch: RUGGED / DEAD (done 2026-09-29)

- Rules, pure and tested: `packages/shared/src/vitals.ts` (`lifeStateOf`, `vitals.test.ts`).
  - **RUGGED** (final) needs all four:
    1. it migrated (status MIGRATED); a coin still on the curve is never marked rugged (owner's call, 2026-09-29);
    2. the creator sold more than 50% of what they bought;
    3. it had traction: at least 15 peak holders and a day with more than $8k of 24h volume (USD via Redis `quote:usd`);
    4. it collapsed: no trade for 6h, or market cap more than 70% below its ATH.
  - **DEAD**: 24h without a trade; it revives on the next trade.
  - All thresholds are `RUG_*` / `DEAD_IDLE_HOURS` env vars (see `.env.example`). The owner's literal rule ("no trades 6h AND daily volume > 8k") is contradictory, so it was interpreted as "had traction, then the dev dumped, then it collapsed".
- Schema: `Token.peakVolume24hQuote`, `peakHolders`, `creatorBoughtBase`, `creatorSoldBase`, `lifeState` (enum `LifeState`), `lifeStateAt`. Needs `pnpm db:push`.
- Job: `apps/chain/src/jobs/vitals.ts` (`watchVitals`, every `VITALS_MINUTES` on the leader). It runs one SQL pass for creator buy/sell flows, bumps the peaks, and writes state changes.
- DTO: `TokenDTO.lifeState`, `creatorSold` (0..1), `athMarketCapQuote`.
- UI:
  - Creep, rugged: the structure bursts once (`public/zerg/splat.webp`, the egg-burst row of rug.png, via `scripts/zerg-splat.py`), then stays a black husk (`.husk`) with a red "☠ $SYM · RUGGED" plate and a red HP segment.
  - Creep, dead: grey (`.drained`).
  - Also: a notice "A brood has been rugged", red/grey minimap dots, and "Dev sold %" plus the state in the info panel.
  - Board cards: a Rugged/Dead badge and a greyed image.
- Preview: `scripts/preview-proxy.mjs` fakes life state (DEAD after 24h idle; RUGGED for the symbols in `PREVIEW_RUG=SUNDOG,BULL`, but only if that token is MIGRATED with >= 15 holders, same as the real rule).

## Mobs: tokens are creatures (done 2026-09-29)

Tokens on the creep are mobs; the Hatchery/Lair/Hive buildings are now only the platform token (the Hive in the middle) and decor. Owner approved: larva 0–10% of the curve, then the proposed tiers.

- `lib/evolution.ts`, `mobOf(token)`:
  - curve under 10% (`LARVA_MAX_PROGRESS`): **larva**;
  - curve 10–100%: **egg**;
  - COMPLETE: **hatching** (pre-birth egg);
  - MIGRATED: the biggest tier in `MOB_TIERS` whose market cap AND holder floor it meets:
    - zergling: none;
    - hydralisk: $100k and 25 holders;
    - mutalisk: $250k and 50;
    - queen: $500k and 100;
    - defiler: $1M and 250;
    - ultralisk: $5M and 500.

  The holder floor was added after the owner saw a 0-holder coin render as a giant in the preview (fake data). It keeps thin, pumped coins small.
  - `stageOf` (the chip ladder) uses the same 10% larva cut; the graduated stage is now named "Hatched".
- Sprites: `components/creep/sprites.tsx`.
  - `MobSprite` shows larvae wriggling and eggs pulsing. Hatched creatures show their `idle-*` still: ground units breathe (`.mob-idle`); the flyers, mutalisk and queen, hover (`.mob-fly`, listed in `FLYERS`).
  - With `grow`, it plays the transformation once: the curl for larva → egg, and the `hatch-*` birth for anything hatched.
  - `AnimatedSprite` has `hold` (last frame) and `onEnd`. `still`/`hold` set `animation: none` inline, because the unlayered `.zsprite` rule beats Tailwind's `[animation:none]`.
- Map (`creep-map.tsx`, `MapMob`):
  - When `mobOf` rises between polls, the transformation plays, with a notice ("A brood has hatched" / "Evolution complete").
  - Control groups: 1 Larvae, 2 Eggs, 3 Swarm.
  - Rugged mobs are black husks, dead ones grey (from the life watch).
- Morph screen: the larva idles; during gestation it curls into an egg, which pulses; when done it shows the pre-birth egg.
- The Manual (`/docs`) lists the six creatures with their floors, and the Dead/Rugged rules.
- Preview: `PREVIEW_MOBS=SYM:usd:holders,…` graduates those symbols in `scripts/preview-proxy.mjs`. The command used:

  ```
  PREVIEW_RUG=SUNDOG,BULL PREVIEW_MOBS=SUN:40000:30,TINU:120000:40,TIEDAN:300000:80,SUNDOG:600000:150,BULL:2000000:400,SUNWUKONG:8000000:900,PENGU:8000000:0
  ```

  In that preview, PENGU shows that a coin with 0 holders stays a zergling.

## Fork test (passed 27/27, 2026-09-29)

`apps/chain/src/scripts/e2e-fork.ts` was adapted to The Hatchery: reflections off, a 1.6% fee, funding sized for the 150k → 2M curve, and vitals checks. It covers:
- launch and indexing;
- curve trades, including pay-with-SOL through Jupiter;
- the fee rate, and Meteora's 20% share;
- claims: creator 75/128 and platform 53/128 of each claim, with the creator transfer landing and the treasury receiving exactly its share;
- no holder share, and claims refused;
- vitals;
- graduation to DAMM v2 with the LP permanently locked;
- a post-graduation trade and LP fee split;
- the earnings API.

How it was run:
- Throwaway keys and env live in the session scratchpad, never in the repo.
- Surfpool: `surfpool start --rpc-url <helius> --no-tui --port 8999 --ws-port 9000 --airdrop <fee claimer> --airdrop-amount 100000000000`.
- Docker postgres/redis; `pnpm db:push`; `pnpm config:create --send` against the fork.
- Then `tsx src/server.ts` (api, PORT=3012), `src/indexer.ts` and `src/service.ts`, with `REFLECT_INTERVAL_MINUTES=1`, `REFLECT_MIN_CLAIM_QUOTE=1`, `VITALS_MINUTES=1`, `RPC_URL=http://127.0.0.1:8999`, `RPC_WS_URL=ws://127.0.0.1:9000`.
- Finally `E2E_KEYS_DIR=… E2E_API_URL=http://localhost:3012 E2E_METADATA_URI=… npx tsx src/scripts/e2e-fork.ts`.

Gotchas:
- Surfpool reports block times near 1970, so a token on the fork reads DEAD. The vitals check only asserts "not RUGGED".
- Local ports are 5435/6382, because TronPad's dev containers hold 5434/6381.

## Mainnet launch setup (2026-09-29)

- **DBC config (mainnet): `5EEj9Y9pvXGFa5GN27NS2ijFSpZuHLKCLgg1WgjaDaXb`.**
  - Settings: HPOS10I quote, 1.6% fee, curve 150k → 2M HPOS10I, graduation at 429,970.33 HPOS10I, then DAMM v2 with 100% partner-locked LP.
  - Created with tx `5ibMk13Y8Wz6Pe2Hyed6wE8gFgJsK8FtN2UuQbtSFKPjnNqX5WD1LtPdVrAPeXfCYsg2bwTRkzBnSxGGZy79saUv`, and verified on chain.
- Fee claimer: `DGjmjAoCdGSrF4dk6yNsbRykF2MaR3Kihx5zRVwQv4k2` (`keys/fee-claimer.json`). Treasury (the owner's wallet): `AQ4L9t3yTsY7jJeJd4gxdaNKJTkLPkYGR2ka2LhtH4EM`.
- `.env`:
  - The local `hpos-pad/.env` is the production env: `NODE_ENV=production`, RPC and Pinata reused from TronPad, freshly generated `VANITY_ENCRYPTION_KEY`/`SIGNER_TOKEN`, deploy vars at the bottom.
  - It is copied by hand to `/opt/hpospad/.env` (600); `deploy.sh` never ships it.
- Server `root@64.111.93.209`:
  - Ubuntu 24.04, Docker 29, key auth from this Mac; ufw inactive.
  - `DEPLOY_HOST=root@64.111.93.209 ./scripts/deploy.sh` rsyncs to `/opt/hpospad` and runs `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`. That starts postgres, redis, migrate, api, chain-indexer, chain-service, web and caddy.
- Caddy:
  - `api.thehatchery.site` (`API_DOMAIN`) goes to api:3001.
  - `docker/sites/web.caddy`: `thehatchery.site` goes to web:3000; `www` redirects to it.
- Not done yet:
  - no vanity keys (launches fall back to random mints; `pnpm vanity:grind` / `vanity:import`);
  - `OFFICIAL_MINT` / `FEATURED_MINTS` empty (the Hive in the middle has no platform token until one is launched and set).

## Mobile + vanity (2026-09-29)
- Mobile creep, deployed:
  - The map is full-screen (`h-dvh`, map `absolute inset-0`).
  - The bottom HUD is an overlay. On phones: no minimap; the info panel only while something is selected; one row of commands plus Menu (`md:hidden`). The desktop 3×3 command card is `hidden md:block`.
  - "A larva awaits" is hidden under `sm`.
  - The camera opens at `z = width/900` on phones, `ZOOM_MIN` is 0.3, and two-finger pinch zoom is in `camera.ts`.
  - Name and "paid" labels counter-scale up to 2× when zoomed out.
  - The trades table drops the base-amount and price columns on phones.
- Phone screenshots: headless Chrome's `--window-size` can't go below ~500px, so use CDP device emulation. The session scratchpad `mshot.mjs` does this: `Emulation.setDeviceMetricsOverride` with `mobile: true`.
- Vanity:
  - 20 `…hpos` mints were imported on the server (`push-vanity.sh`).
  - A local loop grinds 250 more and pushes every 20 (scratchpad `vanity-loop.sh`, log `vanity-loop.log`).
  - Check with `docker compose … exec chain-service node dist/scripts/vanity.js status` on the server.
- Owner to-dos: top up the fee claimer to ~0.5 SOL; do a real mainnet test launch; pick the platform token for `OFFICIAL_MINT`.

## Next ideas (not started)
- The partner's wider idea: "an RTS: mines produce energy, energy builds buildings, barracks produce enemies, like v1 League of Legends". Clarify before building.
- Mobs could wander a little around their spot (the drone already does). Rugged larvae/eggs could use rug.png's larva-death row instead of the egg burst.

## Open decisions for the owner
- Keys and config: done (see Mainnet launch setup). Background (in Turkish, for the owner) in `docs/CONFIG.md`: new fee claimer in `keys/`, treasury address only, `pnpm config:create`. The curve was shrunk at the owner's request (2026-09-29) to 150k → 2M HPOS10I (~$2.4k → ~$32.6k market cap, ~$7k raised = ~15% of HPOS10I's ~$47k Solana liquidity; options table in CONFIG.md). Watch for the port clash if it is deployed next to TronPad.
- Domains: web `thehatchery.site` (+ `www`, redirected), api `api.thehatchery.site`, server `64.111.93.209` (2026-09-29). Socials are set: X `@hpos10ireturns`, Telegram `t.me/hpos10i` (`lib/constants.ts`).
- Morph (launch) fee: currently free. `POOL_CREATION_FEE_SOL` is immutable in the config.
- "Bundle wallets": declined as a hidden feature; they could be shown transparently.
- Git repo and deploy target (TronPad deploys by rsync to its server).
