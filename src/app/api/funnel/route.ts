export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST {step, campaign} → +1 on today's funnel tally. Public and anonymous:
 * the request carries a stage name and a campaign token, nothing about the
 * person, and nothing about them is stored. Rate-limited per IP so a script
 * cannot inflate a stage. Answers 204 whatever happens after validation;
 * a counter is never worth an error in someone's console.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { isFunnelStep, normalizeCampaign } from '@/lib/funnel';

function funnelDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const limit = await rateLimit({ scope: 'funnel', key: clientIp(req), windowMs: 60_000, max: 60 });
  if (!limit.allowed) return new NextResponse(null, { status: 429 });
  const body = await req.json().catch(() => null) as { step?: unknown; campaign?: unknown } | null;
  if (!body || !isFunnelStep(body.step)) return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
  const app = getAdminApp();
  if (!app) return new NextResponse(null, { status: 204 });
  const campaign = normalizeCampaign(body.campaign);
  try {
    await getAdminDb(app).collection('funnel').doc(funnelDayKey()).set({
      steps: { [body.step]: FieldValue.increment(1) },
      campaigns: { [campaign]: { [body.step]: FieldValue.increment(1) } },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error('[funnel]', err instanceof Error ? err.message : err);
  }
  return new NextResponse(null, { status: 204 });
}
