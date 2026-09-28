# Multi-stage build: api + chain (backend) and web (Next.js standalone).
FROM node:20-bookworm-slim AS build
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/chain/package.json apps/chain/
RUN pnpm install --frozen-lockfile --filter '!@hpos-pad/web'
COPY packages packages
COPY apps/api apps/api
COPY apps/chain apps/chain
RUN pnpm --filter @hpos-pad/shared build \
 && pnpm --filter @hpos-pad/db build \
 && pnpm --filter @hpos-pad/api build \
 && pnpm --filter @hpos-pad/chain build
# Self-contained production trees, then drop in the generated Prisma client
# next to whichever @prisma/client the deploy resolved.
RUN pnpm --filter @hpos-pad/api --prod deploy /out/api \
 && pnpm --filter @hpos-pad/chain --prod deploy /out/chain \
 && GEN=$(find /repo/node_modules/.pnpm -maxdepth 4 -type d -path '*@prisma+client*/node_modules/.prisma' | head -1) \
 && test -n "$GEN" \
 && for out in /out/api /out/chain; do \
      for client in $(find $out/node_modules/.pnpm -maxdepth 3 -type d -path '*@prisma+client*/node_modules' ); do cp -r "$GEN" "$client/"; done; \
    done

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
USER node

FROM runtime AS api
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
EXPOSE 3001
CMD ["node", "dist/server.js"]

FROM runtime AS chain
WORKDIR /app
COPY --from=build --chown=node:node /out/chain ./
CMD ["node", "dist/indexer.js"]

# ---------------------------------------------------------------- web
# NEXT_PUBLIC_* are inlined at build time, so they are build args.
FROM node:20-bookworm-slim AS web-build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @hpos-pad/web... --filter @hpos-pad/shared
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @hpos-pad/web build

FROM node:20-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
