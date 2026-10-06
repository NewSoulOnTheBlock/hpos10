#!/usr/bin/env bash
# Ship the backend to the server and (re)start it.
#   DEPLOY_HOST=root@168.100.10.26 ./scripts/deploy.sh
set -euo pipefail
HOST="${DEPLOY_HOST:?set DEPLOY_HOST, e.g. root@1.2.3.4}"
DIR="${DEPLOY_DIR:-/opt/hpospad}"
cd "$(dirname "$0")/.."

ssh "$HOST" "mkdir -p $DIR/keys/vanity && chmod 700 $DIR/keys $DIR/keys/vanity && chown -R 1000:1000 $DIR/keys/vanity"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude logs \
  --exclude '.env' --exclude '.env.*' --exclude keys --exclude 'apps/web/.env*' \
  ./ "$HOST:$DIR/"
ssh "$HOST" "cd $DIR && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build && docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
