#!/usr/bin/env bash
# What is actually running on this box, checked rather than assumed.
#
#   bash scripts/server-verify.sh
#
# Read-only. Prints one line per check with OK / WARN / FAIL so the state of
# the server can be pasted into a conversation and read at a glance. Every
# check here corresponds to something that was believed true at some point
# this week and turned out not to be until it was measured.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

ok()   { printf 'OK    %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; }

echo "== code =="
LOCAL=$(git rev-parse --short HEAD 2>/dev/null)
git fetch -q origin 2>/dev/null
REMOTE=$(git rev-parse --short "origin/$(git rev-parse --abbrev-ref HEAD)" 2>/dev/null)
if [ "$LOCAL" = "$REMOTE" ]; then ok "checkout $LOCAL matches origin"; else warn "checkout $LOCAL but origin is $REMOTE — a deploy has not run since the last push"; fi

echo "== app =="
HEALTH=$(curl -fsS --max-time 5 http://localhost:3000/api/health 2>/dev/null)
if [ -z "$HEALTH" ]; then fail "app not answering on :3000"; else
  RUN_SHA=$(printf '%s' "$HEALTH" | sed -n 's/.*"sha":"\([0-9a-f]*\)".*/\1/p' | head -1)
  STATUS=$(printf '%s' "$HEALTH" | sed -n 's/.*"status":"\([a-z-]*\)".*/\1/p')
  UP=$(printf '%s' "$HEALTH" | sed -n 's/.*"uptimeSeconds":\([0-9]*\).*/\1/p')
  if [ "$RUN_SHA" = "$LOCAL" ]; then ok "running build is $RUN_SHA (same as checkout), status=$STATUS, up ${UP}s"; else warn "running build is $RUN_SHA but checkout is $LOCAL — restart pending or deploy failed"; fi
  [ "$STATUS" = "ok" ] || fail "health status is '$STATUS' — read .deploy-status.json"
fi

echo "== pm2 =="
if command -v pm2 >/dev/null; then
  pm2 jlist 2>/dev/null | node -e '
    const list = JSON.parse(require("fs").readFileSync(0, "utf8"));
    for (const p of list) {
      const env = p.pm2_env || {};
      const leaked = Object.keys(env).filter(k => /^DEPLOY_(LOCKED|REEXECED)$/.test(k));
      const mem = env.max_memory_restart ? (env.max_memory_restart/1024/1024|0)+"MB" : "none";
      const line = `${p.name} status=${env.status} restarts=${env.restart_time} memguard=${mem}`;
      if (env.status !== "online") console.log("FAIL  " + line);
      else if (leaked.length) console.log("WARN  " + line + " — carries " + leaked.join(",") + " (stale env; restart it from a clean shell once)");
      else console.log("OK    " + line);
    }'
else fail "pm2 not found"; fi

echo "== cron =="
CT=$(crontab -l 2>/dev/null)
for job in notifications/process admin/reconcile-subscriptions admin/backup admin/error-digest; do
  if printf '%s' "$CT" | grep -q "$job"; then ok "cron: $job"; else fail "cron missing: $job"; fi
done
if printf '%s' "$CT" | grep "reconcile" | grep -q -- "--max-time"; then ok "reconcile cron has --max-time"; else warn "reconcile cron has no --max-time (deploy.sh rewrites it on the next deploy)"; fi

echo "== box =="
SWAP=$(free -m | awk '/Swap:/{print $2}')
[ "${SWAP:-0}" -gt 0 ] && ok "swap ${SWAP}MB" || warn "no swap configured"
DISK=$(df -h / | awk 'NR==2{print $5}')
ok "disk used $DISK"
LOAD=$(awk '{print $1", "$2", "$3}' /proc/loadavg)
ok "load average $LOAD ($(nproc) cores)"

echo "== env =="
# Third-party keys live in EITHER .env.production OR, encrypted, in Firestore
# at system/secrets — that is what Admin → Integrations writes to, and
# getSecret() reads the file only as a fallback. Checking the file alone
# reported R2_PUBLIC_URL and RESEND_API_KEY as missing on a box where both
# were set and working, which is a false alarm that wastes a morning.
for v in CRON_SECRET NEXT_PUBLIC_APP_URL FIREBASE_PRIVATE_KEY ENCRYPTION_KEY; do
  if grep -qE "^$v=." .env.production 2>/dev/null; then ok "$v set (.env.production)"; else fail "$v not set — it can only live in .env.production"; fi
done

node --env-file=.env.production -e '
const { createHash, createDecipheriv } = require("crypto");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const KEYS = ["R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET_NAME","R2_PUBLIC_URL","RESEND_API_KEY","OPENAI_API_KEY","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET"];
(async () => {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, "\n");
  initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) });
  const snap = await getFirestore().collection("system").doc("secrets").get();
  const stored = snap.exists ? (snap.data() ?? {}) : {};
  const master = process.env.ENCRYPTION_KEY ? createHash("sha256").update(process.env.ENCRYPTION_KEY).digest() : null;
  for (const k of KEYS) {
    if (process.env[k]) { console.log(`OK    ${k} set (.env.production)`); continue; }
    const p = stored[k];
    if (!p?.ciphertext) { console.log(`WARN  ${k} not set anywhere — feature is off`); continue; }
    if (!master) { console.log(`WARN  ${k} stored in Firestore but ENCRYPTION_KEY is missing, so it cannot be read`); continue; }
    try {
      const d = createDecipheriv("aes-256-gcm", master, Buffer.from(p.iv, "base64"));
      d.setAuthTag(Buffer.from(p.authTag, "base64"));
      const v = Buffer.concat([d.update(Buffer.from(p.ciphertext, "base64")), d.final()]).toString("utf8");
      console.log(v ? `OK    ${k} set (Admin → Integrations)` : `WARN  ${k} stored but empty`);
    } catch { console.log(`FAIL  ${k} stored but will not decrypt — wrong ENCRYPTION_KEY?`); }
  }
})().catch((e) => console.log("WARN  could not read system/secrets: " + e.message));
' 2>/dev/null || warn "could not check Firestore-stored secrets (needs firebase-admin and a reachable database)"

grep -qE "^FIREBASE_TOKEN=." .env.production 2>/dev/null && ok "FIREBASE_TOKEN set — rules auto-deploy" || warn "FIREBASE_TOKEN not set — firestore.rules must be pasted by hand after every change"

echo "== done =="
