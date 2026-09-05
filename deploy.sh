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
# npm ci, not npm install: installs exactly what package-lock.json says and
# fails loudly on drift, instead of quietly resolving something newer on the
# server than was tested. Under `set -e` a resolution failure here used to
# abort the deploy with nothing but a line in the webhook's stdout.
npm ci --no-audit --no-fund

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

# Record what is live, for /api/health and for the webhook's failure path.
# Until now a failed deploy left the previous build serving with nothing
# anywhere saying so; a green push was assumed to mean a deployed push.
printf '{"ok":true,"sha":"%s","at":"%s"}\n' "$(git rev-parse --short HEAD)" "$(date -u +%FT%TZ)" > .deploy-status.json

echo "==> Firestore rules & indexes"
# This script deploys CODE only. firestore.rules, firestore.indexes.json and
# storage.rules have to be published separately, and drift between the repo
# and the console has already caused a full-collection scan fallback in
# production. If a Firebase CI token is present, publish them here; if not,
# say so loudly instead of silently leaving them stale.
if [ -n "${FIREBASE_TOKEN:-}" ] || [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
  if npx --yes firebase-tools@13 deploy --only firestore:rules,firestore:indexes,storage --non-interactive ${FIREBASE_PROJECT_ID:+--project "$FIREBASE_PROJECT_ID"}; then
    echo "    rules + indexes published"
  else
    echo "    *** WARNING: firebase deploy failed — rules/indexes in the console may be STALE ***"
  fi
else
  echo "    skipped — set FIREBASE_TOKEN (firebase login:ci) in the deploy environment to publish automatically."
  echo "    Until then: paste firestore.rules + storage.rules in the console, and deploy indexes with:"
  echo "      npx firebase-tools deploy --only firestore:indexes"
fi

echo "==> Cleaning up previous build"
rm -rf "$PREVIOUS"

echo "==> Ensuring the notifications cron is installed"
# /api/notifications/process (trial-ending emails, payment-failed reminders,
# achievement emails) is only ever triggered by vercel.json's Vercel Cron —
# which does nothing here, since this app runs on our own VPS via pm2, not
# Vercel. Without a real cron hitting it, those emails silently never send —
# most importantly the trial-ending reminder, one of the highest-leverage
# emails for converting a free trial into a paying subscription. This
# installs (idempotently — checked by marker comment, safe to run every
# deploy) an hourly crontab entry that calls it the same way Vercel Cron
# would, reading CRON_SECRET/NEXT_PUBLIC_APP_URL from the same env file
# `next start` itself loads at runtime (.env.production takes priority,
# same as Next's own load order — see
# https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
# rather than hardcoding either value.
CRON_MARKER="# warfare-fitness-notifications-cron"
ENV_FILE=""
if [ -f .env.production ]; then ENV_FILE=".env.production"
elif [ -f .env ]; then ENV_FILE=".env"
fi
if [ -n "$ENV_FILE" ]; then
  APP_CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d '=' -f2-)"
  APP_URL="$(grep -E '^NEXT_PUBLIC_APP_URL=' "$ENV_FILE" | head -1 | cut -d '=' -f2-)"
  if [ -n "$APP_CRON_SECRET" ] && [ -n "$APP_URL" ]; then
    CRON_CMD="curl -fsS -X POST -H \"Authorization: Bearer ${APP_CRON_SECRET}\" \"${APP_URL%/}/api/notifications/process\" >/dev/null 2>&1 ${CRON_MARKER}"
    # Daily reconciliation of Firestore membership state against Stripe. The
    # webhook is the hot path; this is the safety net for a delivery that was
    # lost for good (Stripe stops retrying after ~3 days), which used to mean
    # a cancelled subscription kept full paid access forever with nothing
    # anywhere that would notice. Runs at 04:17 to avoid the busy hour tick.
    RECONCILE_CMD="curl -fsS -X POST -H \"Authorization: Bearer ${APP_CRON_SECRET}\" \"${APP_URL%/}/api/admin/reconcile-subscriptions\" >/dev/null 2>&1 ${CRON_MARKER}"
    # Nightly full Firestore export. The route existed and was CRON_SECRET-
    # protected from the start, but nothing ever scheduled it — so this app
    # has been running with no automated backup at all. Runs at 03:22 UTC,
    # off the hour and away from the other two jobs so a slow export never
    # overlaps the notification sweep. --max-time 900: a full dump of a
    # growing database is the one job here that legitimately takes minutes,
    # but it must not hang forever holding a worker.
    BACKUP_CMD="curl -fsS --max-time 900 -X POST -H \"Authorization: Bearer ${APP_CRON_SECRET}\" \"${APP_URL%/}/api/admin/backup\" >/dev/null 2>&1 ${CRON_MARKER}"
    ( crontab -l 2>/dev/null | grep -vF "$CRON_MARKER" || true ; echo "0 * * * * ${CRON_CMD}" ; echo "17 4 * * * ${RECONCILE_CMD}" ; echo "22 3 * * * ${BACKUP_CMD}" ) | crontab -
    echo "    cron installed: hourly POST to /api/notifications/process"
    echo "    cron installed: daily POST to /api/admin/reconcile-subscriptions"
    echo "    cron installed: nightly POST to /api/admin/backup (03:22 UTC)"
  else
    echo "    skipped — CRON_SECRET or NEXT_PUBLIC_APP_URL not set in $ENV_FILE"
  fi
else
  echo "    skipped — no .env.production or .env file found"
fi

echo "==> Checking the installer is sealed"
# firestore.rules no longer contains an installer exemption (see the deleted
# installerNotDone()), so an unsealed install can no longer grant admin
# rights by itself — but an unsealed marker still leaves /install reachable,
# which is how a live deployment ended up with the setup wizard exposed.
# /api/install's GET reports installed:true if the marker is set OR any admin
# already exists, so this is a cheap post-deploy assertion.
if [ -n "${APP_URL:-}" ]; then
  INSTALL_STATE="$(curl -fsS "${APP_URL%/}/api/install" 2>/dev/null || echo '')"
  case "$INSTALL_STATE" in
    *'"installed":true'*) echo "    installer sealed" ;;
    '')                   echo "    WARNING: could not reach ${APP_URL%/}/api/install to verify" ;;
    *)                    echo "    *** WARNING: INSTALLER IS NOT SEALED — /install is reachable. Complete setup or set system/installer.installed=true ***" ;;
  esac
fi

echo "==> Deploy complete"
