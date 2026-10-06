#!/usr/bin/env bash
# Import freshly ground vanity keypairs into the SERVER's pool.
#   DEPLOY_HOST=root@168.100.10.26 ./scripts/push-vanity.sh
# Keypairs are copied over SSH, imported (encrypted into Postgres) on the
# server, then removed from its disk; locally they move to keys/vanity/pushed/.
set -euo pipefail
HOST="${DEPLOY_HOST:?set DEPLOY_HOST}"
DIR="${DEPLOY_DIR:-/opt/hpospad}"
cd "$(dirname "$0")/.."
shopt -s nullglob
files=(keys/vanity/*.json)
if [ ${#files[@]} -eq 0 ]; then echo "no new keypairs in keys/vanity"; exit 0; fi
# scp + chmod/chown on the server: macOS rsync lacks --chmod/--chown.
scp -q "${files[@]}" "$HOST:$DIR/keys/vanity/"
ssh "$HOST" "chmod 600 $DIR/keys/vanity/*.json && chown -R 1000:1000 $DIR/keys/vanity"
ssh "$HOST" "cd $DIR && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T -e VANITY_DIR=/app/keys/vanity chain-service node dist/scripts/vanity.js import && rm -rf $DIR/keys/vanity/imported"
mkdir -p keys/vanity/pushed && mv "${files[@]}" keys/vanity/pushed/
echo "pushed ${#files[@]} keypair(s)"
