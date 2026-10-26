#!/usr/bin/env bash
# The eval harness: everything that can be checked without a human, in one
# command, with one exit code.
#
#   bash scripts/audit.sh              # type-check, tests, lint, build
#   bash scripts/audit.sh --quick      # skip the build (a minute faster)
#   BASE=https://warfarefitness.com bash scripts/audit.sh --live
#                                      # also run the live smoke test
#
# On the server, `bash scripts/server-verify.sh && bash scripts/smoke.sh` is
# the deployed-build check; this is the source check that should pass before
# anything is pushed. deploy.sh runs the smoke test on its own.
#
# Lint is judged against a recorded baseline rather than zero: the codebase
# carries a known set of warnings that are not worth a deploy, but a NEW one
# is a regression and fails the run. Update the number in .lint-baseline
# only when a warning is deliberately removed or accepted.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

QUICK=0; LIVE=0
for a in "$@"; do
  case "$a" in
    --quick) QUICK=1 ;;
    --live) LIVE=1 ;;
    *) echo "unknown flag: $a"; exit 2 ;;
  esac
done

FAILS=0
ok()   { printf 'OK    %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILS=$((FAILS+1)); }
step() { printf '\n== %s ==\n' "$*"; }

if [ ! -d node_modules ]; then
  step "dependencies"
  npm ci --no-audit --no-fund >/dev/null 2>&1 && ok "installed" || { fail "npm ci failed"; exit 1; }
fi

step "type check"
if npx tsc --noEmit >/tmp/audit-tsc.log 2>&1; then ok "tsc clean"; else fail "tsc reported errors:"; head -20 /tmp/audit-tsc.log; fi

step "unit tests"
if npx vitest run >/tmp/audit-vitest.log 2>&1; then
  ok "$(grep -E '^\s+Tests ' /tmp/audit-vitest.log | sed 's/^ *//')"
else
  fail "tests failed:"; grep -E "FAIL|✗|×|AssertionError|Error:" /tmp/audit-vitest.log | head -20
fi

step "lint"
BASELINE=$(cat .lint-baseline 2>/dev/null || echo 0)
# next lint writes its report to stderr, so both streams are counted.
COUNT=$(npx next lint 2>&1 | grep -cE "Error:|Warning:" || true)
if [ "$COUNT" -le "$BASELINE" ]; then ok "lint problems: $COUNT (baseline $BASELINE)"; else fail "lint problems: $COUNT, above the baseline of $BASELINE — a new warning or error was introduced"; fi

if [ "$QUICK" -eq 0 ]; then
  step "production build"
  if npm run build >/tmp/audit-build.log 2>&1; then ok "build compiled"; else fail "build failed:"; grep -E "Error|error|Failed" /tmp/audit-build.log | head -20; fi
fi

if [ "$LIVE" -eq 1 ]; then
  step "live smoke test (${BASE:-http://localhost:3000})"
  if bash scripts/smoke.sh; then ok "smoke test passed"; else fail "smoke test failed (see FAIL lines above)"; fi
fi

step "summary"
if [ "$FAILS" -gt 0 ]; then printf 'FAILED  %d check(s)\n' "$FAILS"; exit 1; fi
echo "PASSED  everything"
