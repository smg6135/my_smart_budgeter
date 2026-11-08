#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -d "$HOME/.nvm/versions/node" ]; then
  pocket_node=$(find "$HOME/.nvm/versions/node" -path '*/v24.*/bin' -type d | sort | tail -n 1)
  if [ -n "$pocket_node" ]; then export PATH="$pocket_node:$PATH"; fi
fi
docker info >/dev/null 2>&1 || { echo 'Start Docker Desktop, then retry.' >&2; exit 1; }
if [ ! -f apps/mobile/.env ]; then cp apps/mobile/.env.example apps/mobile/.env; fi
if [ ! -d apps/mobile/node_modules ]; then (cd apps/mobile && npm ci); fi
docker compose up --build -d
trap 'docker compose stop' EXIT INT TERM
cd apps/mobile
npm run web -- --port 8081
