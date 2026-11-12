export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One place to see whether the paid services are running low.
 *
 * - OpenAI spend: today, last 7 days, this month and since the last top-up,
 *   from OpenAI's Costs API. Needs OPENAI_ADMIN_KEY (an sk-admin key, read
 *   only). OpenAI has no API for the prepaid credit balance itself, so the
 *   admin records the balance when topping up and the remainder is that
 *   figure minus the spend since then.
 * - Brevo email credits, straight from Brevo's account API when it is the sender.
 * - Today's AI calls against the app-wide daily ceiling.
 *
 * POST { creditUsd, lowAtUsd } records a top-up (balance as of now).
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getSecret } from '@/lib/secrets';
import { getOrgAiUsage } from '@/lib/usageLimit';

const DAY = 86_400;

async function openAiCosts(key: string, startSec: number): Promise<{ byDay: { date: string; usd: number }[] }> {
  const byDay: { date: string; usd: number }[] = [];
  let page: string | null = null;
  for (let i = 0; i < 4; i++) {
    const u = new URL('https://api.openai.com/v1/organization/costs');
    u.searchParams.set('start_time', String(startSec));
    u.searchParams.set('bucket_width', '1d');
    u.searchParams.set('limit', '31');
    if (page) u.searchParams.set('page', page);
    const res = await fetch(u, { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(res.status === 401 || res.status === 403
        ? 'OpenAI refused the admin key. It must be an Admin key (sk-admin-...) from platform.openai.com → Settings → Admin keys.'
        : `OpenAI costs request failed (${res.status}) ${body.slice(0, 120)}`);
    }
    const j = await res.json() as { data?: { start_time: number; results?: { amount?: { value?: number } }[] }[]; has_more?: boolean; next_page?: string | null };
    for (const b of j.data ?? []) {
      const usd = (b.results ?? []).reduce((a, r) => a + (Number(r.amount?.value) || 0), 0);
      byDay.push({ date: new Date(b.start_time * 1000).toISOString().slice(0, 10), usd });
    }
    if (!j.has_more || !j.next_page) break;
    page = j.next_page;
  }
  return { byDay };
}

async function brevoCredits(key: string): Promise<{ credits: number; type: string }[] | null> {
  const res = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': key, accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) return null;
  const j = await res.json() as { plan?: { type?: string; credits?: number; creditsType?: string }[] };
  return (j.plan ?? []).filter((p) => typeof p.credits === 'number').map((p) => ({ credits: p.credits as number, type: p.creditsType || p.type || 'credits' }));
}

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const budgetSnap = await db.collection('system').doc('aiBudget').get();
  const budget = budgetSnap.data() as { creditUsd?: number; lowAtUsd?: number; asOf?: Timestamp } | undefined;
  const asOfSec = budget?.asOf ? Math.floor(budget.asOf.toMillis() / 1000) : null;

  const now = new Date();
  const monthStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const todayStart = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);
  const start = Math.min(monthStart, todayStart - 6 * DAY, asOfSec ?? Infinity);

  const openai: Record<string, unknown> = { configured: false };
  const adminKey = await getSecret('OPENAI_ADMIN_KEY').catch(() => '');
  if (adminKey) {
    openai.configured = true;
    try {
      const { byDay } = await openAiCosts(adminKey, start);
      const sumFrom = (sec: number) => byDay.filter((d) => Date.parse(`${d.date}T00:00:00Z`) / 1000 >= sec - DAY / 2).reduce((a, d) => a + d.usd, 0);
      openai.todayUsd = sumFrom(todayStart);
      openai.last7Usd = sumFrom(todayStart - 6 * DAY);
      openai.monthUsd = sumFrom(monthStart);
      // Average of the last 7 days, to say roughly how long the credit lasts.
      openai.dailyAvgUsd = (openai.last7Usd as number) / 7;
      if (budget?.creditUsd != null && asOfSec != null) {
        // Day-bucketed, so spend from the top-up day counts in full: errs low, never high.
        const since = byDay.filter((d) => Date.parse(`${d.date}T00:00:00Z`) / 1000 >= asOfSec - DAY + 1).reduce((a, d) => a + d.usd, 0);
        openai.sinceTopUpUsd = since;
        openai.remainingUsd = Math.max(0, budget.creditUsd - since);
      }
    } catch (e) {
      openai.error = e instanceof Error ? e.message : String(e);
    }
  }

  let brevo: unknown = null;
  const brevoKey = await getSecret('BREVO_API_KEY').catch(() => '');
  if (brevoKey) brevo = await brevoCredits(brevoKey).catch(() => null);

  const usage = await getOrgAiUsage(app).catch(() => null);

  return NextResponse.json({
    openai,
    budget: budget ? { creditUsd: budget.creditUsd ?? null, lowAtUsd: budget.lowAtUsd ?? 10, asOf: budget.asOf?.toMillis() ?? null } : { creditUsd: null, lowAtUsd: 10, asOf: null },
    brevo,
    usage,
  });
}

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const body = await req.json().catch(() => ({})) as { creditUsd?: unknown; lowAtUsd?: unknown };
  const creditUsd = Number(body.creditUsd), lowAtUsd = Number(body.lowAtUsd ?? 10);
  if (!Number.isFinite(creditUsd) || creditUsd < 0 || creditUsd > 100_000) return NextResponse.json({ error: 'Enter the balance in dollars' }, { status: 400 });
  await getAdminDb(app).collection('system').doc('aiBudget').set({
    creditUsd, lowAtUsd: Number.isFinite(lowAtUsd) && lowAtUsd >= 0 ? lowAtUsd : 10, asOf: FieldValue.serverTimestamp(), setBy: check.uid,
  }, { merge: true });
  return NextResponse.json({ ok: true });
}
