export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET ?days=7|30|90 — the funnel tallies summed over the last N days,
 *  in total and per campaign. Admin only. */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { FUNNEL_STEPS } from '@/lib/funnel';

type Tally = Record<string, number>;

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const days = Math.min(365, Math.max(1, Math.round(Number(req.nextUrl.searchParams.get('days')) || 30)));
  const since = new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10);
  const snap = await getAdminDb(app).collection('funnel').where('__name__', '>=', since).get();
  const totals: Tally = Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0]));
  const campaigns: Record<string, Tally> = {};
  const daily: { day: string; visit: number; q1: number; account: number; paid: number }[] = [];
  for (const d of snap.docs) {
    const data = d.data() as { steps?: Tally; campaigns?: Record<string, Tally> };
    for (const [k, v] of Object.entries(data.steps ?? {})) totals[k] = (totals[k] ?? 0) + (Number(v) || 0);
    for (const [c, t] of Object.entries(data.campaigns ?? {})) {
      campaigns[c] ??= {};
      for (const [k, v] of Object.entries(t)) campaigns[c][k] = (campaigns[c][k] ?? 0) + (Number(v) || 0);
    }
    daily.push({ day: d.id, visit: data.steps?.visit ?? 0, q1: data.steps?.q1 ?? 0, account: data.steps?.account ?? 0, paid: data.steps?.paid ?? 0 });
  }
  daily.sort((a, b) => a.day.localeCompare(b.day));
  return NextResponse.json({ days, totals, campaigns, daily });
}
