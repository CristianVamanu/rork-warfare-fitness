export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness + "what is actually deployed".
 *
 * A push to the deploy branch was assumed to mean a deployed push. It
 * wasn't: deploy.sh runs under `set -e`, and an npm or build failure aborted
 * it with the previous build still serving and nothing anywhere saying so.
 * deploy.sh now writes .deploy-status.json on success and the webhook writes
 * it on failure; this reports it, plus the SHA baked in at build time, so
 * "is my change live?" is one curl instead of an SSH session.
 *
 * Unauthenticated on purpose — it carries no secrets, only a short SHA and a
 * timestamp — so an uptime monitor can hit it.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  let deploy: Record<string, unknown> | null = null;
  try {
    deploy = JSON.parse(await readFile(path.join(process.cwd(), '.deploy-status.json'), 'utf8'));
  } catch {
    // No marker yet (first deploy after this file landed) — not an error.
  }
  const ok = !deploy || deploy.ok !== false;
  return NextResponse.json(
    {
      status: ok ? 'ok' : 'deploy-failed',
      deploy,
      uptimeSeconds: Math.round(process.uptime()),
      now: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
