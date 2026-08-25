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
PWA_STAGING="public-pwa-staging"

echo "==> Pulling latest code"
git fetch origin
git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"

echo "==> Installing dependencies"
npm install

echo "==> Building into $STAGING (live .next untouched)"
rm -rf "$STAGING" "$PWA_STAGING"
# tsconfig.json's "include" hardcodes ".next/types/**/*.ts" — the LIVE
# .next dir, not $NEXT_DIST_DIR — so even though this build's real output
# goes to .next-staging, the typecheck step still reads whatever type
# stubs are sitting in the live .next/types from the PREVIOUS build. If
# that previous build had a route this one no longer does (e.g. a page
# just got deleted), typecheck fails on "Cannot find module" for a route
# that doesn't exist anymore — breaking the deploy for a change that was
# otherwise entirely correct. .next/types is pure build-time scaffolding
# (the running server never reads it), so it's always safe to clear before
# building; Next regenerates it fresh for the current route set.
rm -rf .next/types
# NEXT_DIST_DIR is read by next.config.js for .next. NEXT_PWA_DEST does the
# same for next-pwa's own output (sw.js, sw.js.map, workbox-*.js, and the
# content-hashed custom worker-*.js chunk) — next-pwa writes those straight
# to disk regardless of NEXT_DIST_DIR, so without redirecting them too, a
# ~90s build was overwriting the LIVE public/ service worker files in
# place while the old server was still actively serving them. A real
# user's browser could fetch sw.js right as this replaced the exact
# worker-*.js chunk it references — the deploy always regenerates a new
# content hash for it — surfacing as "importScripts...not allowed" and a
# blank page in production.
NEXT_DIST_DIR="$STAGING" NEXT_PWA_DEST="$PWA_STAGING" npm run build

echo "==> Swapping in the new build"
rm -rf "$PREVIOUS"
if [ -e .next ]; then mv .next "$PREVIOUS"; fi
mv "$STAGING" .next

echo "==> Swapping in the new service worker files"
# Every workbox-*.js/worker-*.js filename is content-hashed and unique per
# build, so there's no actual collision risk in leaving old ones in place —
# only sw.js itself needs to be the single, current pointer (it's served
# with Cache-Control: no-cache specifically so browsers always revalidate
# it). Deleting the previous deploy's workbox/worker files immediately (the
# old behavior) broke any browser tab whose service worker hadn't finished
# updating yet: the moment the NEXT deploy ran, that not-yet-updated worker
# permanently lost the one file it still needed to import, surfacing as
# "importScripts...404" and a broken service worker — reported multiple
# times across tonight's deploys before this was traced back here. Only
# sw.js/sw.js.map get replaced immediately; old workbox/worker chunks are
# now pruned by AGE (find -mtime), not by "is this the previous deploy",
# giving any lagging service worker realistic time to self-update via the
# no-cache sw.js + skipWaiting/clientsClaim path already in place before
# its dependency actually disappears.
find public -maxdepth 1 -mtime +3 \( -name 'workbox-*.js' -o -name 'workbox-*.js.map' -o -name 'worker-*.js' -o -name 'worker-*.js.map' \) -delete
mv "$PWA_STAGING"/sw.js public/sw.js
mv "$PWA_STAGING"/sw.js.map public/sw.js.map 2>/dev/null || true
mv "$PWA_STAGING"/workbox-*.js public/ 2>/dev/null || true
mv "$PWA_STAGING"/workbox-*.js.map public/ 2>/dev/null || true
mv "$PWA_STAGING"/worker-*.js public/ 2>/dev/null || true
mv "$PWA_STAGING"/worker-*.js.map public/ 2>/dev/null || true
rm -rf "$PWA_STAGING"

echo "==> Reloading app (zero-downtime — restarts cluster workers one at a time)"
# The previous build stays on disk until after the reload: workers restart
# one at a time, so a worker that hasn't cycled yet may still hold open
# handles into the old build while its sibling already serves the new one.
pm2 reload ecosystem.config.js --env production

echo "==> Cleaning up previous build"
rm -rf "$PREVIOUS"

echo "==> Deploy complete"
