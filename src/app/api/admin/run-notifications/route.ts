export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only trigger for the notification processor.
 * Verifies Firebase ID token + admin role, then calls the cron handler internally.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAdmin(req);
    if ('error' in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    // Forward to the cron processor with the CRON_SECRET so it passes auth
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`;
    const secret = process.env.CRON_SECRET;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (secret) headers['Authorization'] = `Bearer ${secret}`;

    const res = await fetch(`${baseUrl}/api/notifications/process`, {
      method: 'POST',
      headers,
    });

    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); }
    catch { throw new Error(`Notification processor returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`); }

    return NextResponse.json(data as object, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[run-notifications] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
