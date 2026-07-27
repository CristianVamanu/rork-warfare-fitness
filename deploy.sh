#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Why this builds into a staging directory instead of straight into .next:
#
# `next start` does NOT load every route bundle at boot — it lazily requires
# each route's compiled file out of .next/server/... the first time that
# route is hit, then caches it in memory. So while `next build` was
# overwriting .next in place, the still-live server could try to require a
# route file that was mid-write, or already replaced by the new build's
# content-hashed output. That surfaces as a raw 500 HTML error page (the
# module never loads, so the route's own try/catch never runs) on whatever
# route someone requested during the build — most likely on routes hit
# rarely enough not to already be cached in memory.
#
# Building into .next-staging leaves the live .next untouched for the whole
# build, so the old server keeps serving correctly until the swap. The swap
# itself is two renames (milliseconds) instead of a ~90s exposure window.

STAGING=".next-staging"
PREVIOUS=".next-previous"

echo "==> Pulling latest code"
git fetch origin
git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"

echo "==> Installing dependencies"
npm install

echo "==> Building into $STAGING (live .next untouched)"
rm -rf "$STAGING"
# NEXT_DIST_DIR is read by next.config.js. It is deliberately NOT set for
# `next start`, so the running server always resolves the normal '.next' —
# verified that a build produced under a staging distDir serves correctly
# once renamed into place.
NEXT_DIST_DIR="$STAGING" npm run build

echo "==> Swapping in the new build"
rm -rf "$PREVIOUS"
if [ -e .next ]; then mv .next "$PREVIOUS"; fi
mv "$STAGING" .next

echo "==> Reloading app (zero-downtime — restarts cluster workers one at a time)"
# The previous build stays on disk until after the reload: workers restart
# one at a time, so a worker that hasn't cycled yet may still hold open
# handles into the old build while its sibling already serves the new one.
pm2 reload ecosystem.config.js --env production

echo "==> Cleaning up previous build"
rm -rf "$PREVIOUS"

echo "==> Deploy complete"
