#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Pulling latest code"
git fetch origin
git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"

echo "==> Installing dependencies"
npm install

echo "==> Building"
npm run build

echo "==> Reloading app (zero-downtime — restarts cluster workers one at a time)"
pm2 reload ecosystem.config.js --env production

echo "==> Deploy complete"
