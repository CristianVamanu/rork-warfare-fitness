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

echo "==> Restarting app"
pm2 restart warfare-fitness

echo "==> Deploy complete"
