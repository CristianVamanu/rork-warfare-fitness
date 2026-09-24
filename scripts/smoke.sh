#!/usr/bin/env bash
# Post-deploy smoke test: does the build that just went live actually behave?
#
#   bash scripts/smoke.sh                  # against http://localhost:3000
#   BASE=https://warfarefitness.com bash scripts/smoke.sh
#
# server-verify.sh checks the box — pm2, cron, secrets. This checks the app:
# it hits the running build the way a visitor, an attacker and a cron job
# would, and asserts what comes back. deploy.sh runs it last, after the
# health wait, and a FAIL marks the deploy failed so /api/health reports it
# and nobody assumes a green push was a working push.
#
# Only curl and node, both already on the box. Every check is deterministic
# — nothing here depends on admin-editable copy or on data, so a FAIL is a
# regression, not a settings change. WARN is for things worth a look that
# should never block a deploy.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BASE="${BASE:-http://localhost:3000}"
FAILS=0; WARNS=0
ok()   { printf 'OK    %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; WARNS=$((WARNS+1)); }
fail() { printf 'FAIL  %s\n' "$*"; FAILS=$((FAILS+1)); }

# fetch METHOD PATH [DATA] → sets CODE, MS and leaves the body in $BODYF,
# the headers in $HDRSF.
#
# The body stays in a FILE and is grepped as a file. Holding a 64KB minified
# HTML page in a shell variable and piping it to grep silently failed to
# match on the largest page while matching fine on smaller ones — which as a
# bug in a test is worse than no test, because it reports a healthy page as
# broken and trains you to ignore the output.
# One working directory, removed by a trap however the script exits — a
# smoke test that litters /tmp on every deploy is its own slow-burning bug.
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
BODYF="$WORKDIR/body"; HDRSF="$WORKDIR/headers"
fetch() {
  local method="$1" path="$2" data="${3:-}"
  : > "$BODYF"; : > "$HDRSF"
  local start end
  start=$(date +%s%N)
  if [ -n "$data" ]; then
    CODE=$(curl -sS --max-time 20 -o "$BODYF" -D "$HDRSF" -w '%{http_code}' -X "$method" -H 'Content-Type: application/json' --data "$data" "$BASE$path" 2>/dev/null || echo 000)
  else
    CODE=$(curl -sS --max-time 20 -o "$BODYF" -D "$HDRSF" -w '%{http_code}' -X "$method" "$BASE$path" 2>/dev/null || echo 000)
  fi
  end=$(date +%s%N)
  MS=$(( (end - start) / 1000000 ))
}
body_has()   { grep -qF -- "$1" "$BODYF" 2>/dev/null; }
body_bytes() { wc -c < "$BODYF" 2>/dev/null || echo 0; }
body_grep()  { grep -oE "$1" "$BODYF" 2>/dev/null | head -1; }
has_header() { grep -qi "^$1:" "$HDRSF" 2>/dev/null; }

# page PATH MARKER — 200, HTML, and the marker present in the SERVED HTML.
#
# Markers must be strings the server actually emits, which is not the same as
# strings on the screen: /, /login and /register render a spinner on the
# server and paint their real content after hydration, so a marker taken from
# the visible page fails against a perfectly healthy build. Each marker below
# was checked against live output rather than assumed. None of them is
# admin-editable copy, so changing a headline in the panel cannot fail a
# deploy.
page() {
  local path="$1" marker="$2"
  fetch GET "$path"
  if [ "$CODE" != "200" ]; then fail "$path → HTTP $CODE (expected 200)"; return; fi
  if ! grep -qi '^content-type:.*text/html' "$HDRSF"; then fail "$path → not HTML"; return; fi
  if ! body_has "$marker"; then fail "$path → 200 but missing '$marker' — page rendered empty or wrong"; return; fi
  # A page that errors during render can still return 200 with a near-empty
  # shell. Every real page here is comfortably over 10KB.
  local size; size=$(body_bytes)
  if [ "$size" -lt 10000 ]; then fail "$path → 200 but only ${size} bytes — rendered an empty shell"; return; fi
  if [ "$MS" -gt 4000 ]; then warn "$path → 200 in ${MS}ms (slow)"; else ok "$path → 200 (${MS}ms)"; fi
}

echo "== build =="
fetch GET /api/health
if [ "$CODE" != "200" ]; then
  fail "/api/health → HTTP $CODE — the app is not serving a healthy build"
else
  RUN_SHA=$(body_grep '"sha":"[0-9a-z]*"' | sed 's/.*:"//; s/"//')
  LOCAL_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "")
  if [ "$RUN_SHA" = "unknown" ] || [ -z "$LOCAL_SHA" ]; then warn "running build sha is '$RUN_SHA' (BUILD_SHA not inlined — fine locally, wrong on the server)"
  elif [ "$RUN_SHA" = "$LOCAL_SHA" ]; then ok "running build is $RUN_SHA, same as the checkout"
  else fail "running build is $RUN_SHA but the checkout is $LOCAL_SHA — the old build is still serving"; fi
fi

echo "== public pages =="
# The landing server-renders its real content — it used to send a spinner
# to everyone. These pin that: a hard-coded heading (not admin copy), and the
# two hooks the returning-member splash depends on. If either goes missing
# the page has regressed to client-only rendering or the splash gate broke.
page /                                        'Everything you need. Nothing you don'
page /                                        'data-brand-splash'
page /                                        'data-landing-body'
# These genuinely server-render their content, so the markers are the content.
page /standards                               'Could you pass'
page /standards/royal-marines-entry-test      'Royal Marines'
page /standards/usmc-pft                      'PFT'
page /trainers                                'Own your app'
page /privacy                                 'Privacy'
page /terms                                   'Terms'
# Spinner-on-the-server pages: the assertion is that the document builds and
# is a real page, not that the form is in the HTML — it legitimately is not.
page /login                                   '<title>'
page /register                                '<title>'

echo "== not found =="
fetch GET /this-page-does-not-exist-9f3a
if [ "$CODE" != "404" ]; then fail "unknown URL → HTTP $CODE (expected 404)"
elif body_has 'Off target'; then ok "unknown URL → branded 404"
else fail "unknown URL → 404 but the page is Next's default, not ours (not-found.tsx not rendering)"; fi
fetch GET /standards/royal-marines-endurance
[ "$CODE" = "404" ] && ok "removed standard slug → 404" || fail "removed standard slug → HTTP $CODE (expected 404)"

echo "== discovery + pwa =="
for p in /robots.txt /sitemap.xml /manifest.webmanifest /sw.js; do
  fetch GET "$p"
  [ "$CODE" = "200" ] && ok "$p → 200" || fail "$p → HTTP $CODE"
done
# Apple Pay domain verification (rewritten to /api/stripe/apple-pay-domain).
# 503 = the server could not reach stripe.com for the file; reported, not
# blocking, because the checkout itself is unaffected.
fetch GET /.well-known/apple-developer-merchantid-domain-association
case "$CODE" in
  200) ok "apple-pay domain file → 200" ;;
  503) warn "apple-pay domain file → 503 (stripe.com unreachable from server?)" ;;
  *) fail "apple-pay domain file → HTTP $CODE (rewrite missing?)" ;;
esac

echo "== security headers on / =="
fetch GET /
for h in Strict-Transport-Security X-Frame-Options Content-Security-Policy Referrer-Policy X-Content-Type-Options; do
  has_header "$h" && ok "$h present" || fail "$h missing"
done
has_header X-Powered-By && fail "X-Powered-By leaks the framework" || ok "X-Powered-By absent"

echo "== auth walls (an unauthenticated caller must never get a 2xx) =="
# 401/403 is the right answer. A 500 means the guard is there but the route
# fell over before it — reported, not blocking, because it still says no.
wall() {
  local method="$1" path="$2" what="$3"
  fetch "$method" "$path" '{}'
  case "$CODE" in
    401|403) ok "$what → $CODE" ;;
    2*) fail "$what → HTTP $CODE WITHOUT CREDENTIALS — this route is open" ;;
    5*) warn "$what → $CODE (refused, but by falling over rather than by the guard)" ;;
    *) warn "$what → $CODE (expected 401/403)" ;;
  esac
}
wall GET  /api/admin/errors            "admin errors list"
wall POST /api/admin/errors            "admin errors resolve"
wall POST /api/admin/run-notifications "admin run-notifications"
wall POST /api/admin/backup            "admin backup"
wall GET  "/api/stripe/checkout-session?session_id=cs_test_smoke0000" "stripe checkout-session status"
wall POST /api/notifications/process   "cron notifications/process"
wall POST /api/admin/reconcile-subscriptions "cron reconcile-subscriptions"
wall POST /api/admin/error-digest      "cron error-digest"
# Billing-changing member routes: must refuse without a token as well.
wall POST /api/stripe/cancel-subscription   "member cancel-subscription"
wall POST /api/stripe/create-portal-session "member billing portal"
wall POST /api/auth/2fa/login-check         "2fa login-check"
wall POST /api/ai/scan-and-go               "ai scan-and-go"

echo "== public endpoints validate input =="
# One call, not two: the endpoint allows 5 per 15 minutes per IP, so a
# couple of hand re-runs would otherwise exhaust it and fail a healthy build.
# 429 is accepted because it also proves the request was refused.
fetch POST /api/standards/result '{"email":"not-an-email"}'
case "$CODE" in
  400) ok "standards/result rejects a bad email (400)" ;;
  429) ok "standards/result rate-limited (429) — the limiter works" ;;
  *) fail "standards/result with a bad email → HTTP $CODE (expected 400)" ;;
esac
fetch POST /api/stripe/webhook '{}'
case "$CODE" in 4*) ok "stripe webhook without a signature → $CODE" ;; *) fail "stripe webhook without a signature → HTTP $CODE (expected 4xx)" ;; esac
fetch POST /api/ai/build-my-program '{}'
[ "$CODE" = "410" ] && ok "build-my-program is retired (410)" || warn "build-my-program → HTTP $CODE (expected 410)"
# An EMPTY report on purpose. The route answers 200 and writes nothing when
# there is no message, which is exactly the path to exercise: this proves the
# endpoint is up, parses JSON and rate-limits, without creating an error
# group. The first version posted a real "smoke-test" report and every deploy
# added one to the admin Errors tab and the nightly digest — a test that
# dirties the thing it is testing.
fetch POST /api/client-error '{}'
case "$CODE" in 2*) ok "client-error answers without storing anything ($CODE)" ;; 429) ok "client-error rate-limited (429) — the limiter works" ;; *) fail "client-error → HTTP $CODE" ;; esac

echo "== program matcher (the live catalogue answers the quiz) =="
# A full-gym muscle builder at six days must get a real program back, and
# the response must carry a name. 404 means the catalogue has no public
# programs at all; 429 means the limiter fired on a hand re-run.
fetch POST /api/public/match-program '{"goal":"build-muscle","experience":"intermediate","trainingDays":6,"sex":"male","equipment":"full-gym","age":28}'
case "$CODE" in
  200) if body_has '"name":'; then ok "match-program → $(body_grep '"name":"[^"]*"' | head -1)"; else fail "match-program → 200 without a program name"; fi ;;
  429) ok "match-program rate-limited (429) — the limiter works" ;;
  404) fail "match-program → 404: no program could be matched — is any program public?" ;;
  *) fail "match-program → HTTP $CODE" ;;
esac
fetch POST /api/public/match-program '{"goal":"lose-fat"}'
[ "$CODE" = "400" ] || [ "$CODE" = "429" ] && ok "match-program rejects an incomplete quiz ($CODE)" || fail "match-program with missing fields → HTTP $CODE (expected 400)"

echo "== summary =="
if [ "$FAILS" -gt 0 ]; then
  printf 'FAILED  %d check(s) failed, %d warning(s)\n' "$FAILS" "$WARNS"
  exit 1
else
  printf 'PASSED  all checks, %d warning(s)\n' "$WARNS"
fi
