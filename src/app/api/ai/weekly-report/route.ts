export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET ?today=YYYY-MM-DD — the member's weekly coach report.
 *
 * Covers the last complete Monday-Sunday week (lib/weeklyReport.reportWeek). Made once per member per week, on first
 * open, and stored at weeklyReports/{uid}_{week}; later opens read it.
 * The numbers come from the member's own events and health days; the AI
 * writes only the coaching words (rule-based fallback without it).
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { rateLimit } from '@/lib/rateLimit';
import { isInFreeTrial, hasActiveSubscription } from '@/lib/membership';
import { getSecret } from '@/lib/secrets';
import { resolveDateKey } from '@/lib/dailyTip';
import { checkAndIncrementUsage, resolveLocalDate } from '@/lib/usageLimit';
import { dropAndroidHeart } from '@/lib/healthHeart';
import {
  reportWeek, computeWeekStats, REPORT_VERSION, rulesReport, parseReport, quietWeek, REPORT_SYSTEM_PROMPT,
  type RawEvent, type RawHealthDay, type WeeklyReport,
} from '@/lib/weeklyReport';

const DAY = 86_400_000;

export async function GET(req: NextRequest) {
  const auth = await verifyAuthedNotTfaPending(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const limit = await rateLimit({ scope: 'weekly-report', key: auth.uid, windowMs: 60_000, max: 6 });
  if (!limit.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  // Members only when the whole app is locked to members. The screen is
  // already behind the membership wall; this stops a signed-in non-member
  // from calling the endpoint directly and getting the AI report for free.
  {
    const [meSnap, cfgSnap] = await Promise.all([db.collection('users').doc(auth.uid).get(), db.collection('config').doc('membership').get()]);
    const me = meSnap.data() ?? {};
    const cfg = cfgSnap.data() as { enabled?: boolean; fullLock?: boolean; trialDays?: number; paidTrialEnabled?: boolean } | undefined;
    const staff = me.role === 'admin' || me.role === 'trainer';
    if (!staff && cfg?.enabled && cfg.fullLock && !isInFreeTrial(cfg, me.createdAt) && !hasActiveSubscription(me)) {
      return NextResponse.json({ error: 'Membership required' }, { status: 403 });
    }
  }

  const today = resolveDateKey(req.nextUrl.searchParams.get('today'));
  const week = reportWeek(today);
  const ref = db.doc(`weeklyReports/${auth.uid}_${week}`);
  const existing = await ref.get();
  if (existing.exists && (existing.data()?.quiet || existing.data()?.v === REPORT_VERSION)) {
    const d = existing.data() ?? {};
    return d.quiet ? NextResponse.json({ report: null, reason: 'quiet', week }) : NextResponse.json({ report: d, cached: true });
  }

  const start = new Date(`${week}T00:00:00Z`).getTime();
  const [userSnap, eventsSnap, healthSnaps] = await Promise.all([
    db.doc(`users/${auth.uid}`).get(),
    db.collection('events').where('userId', '==', auth.uid)
      .where('createdAt', '>=', Timestamp.fromMillis(start - 8 * DAY))
      .orderBy('createdAt', 'desc').limit(600).get(),
    db.getAll(...Array.from({ length: 7 }, (_, i) => db.doc(`healthDays/${auth.uid}_${new Date(start + i * DAY).toISOString().slice(0, 10)}`))),
  ]);
  const u = (userSnap.data() ?? {}) as Record<string, unknown>;
  const ap = u.activeProgram as { programId?: string; programName?: string; completedWorkouts?: number; totalWorkouts?: number } | undefined;
  // The member's planned sessions a week, from their program; without it
  // the report assumed 3 and told a 5-day member they hit "5 of 3".
  const prog = ap?.programId ? await db.doc(`programs/${ap.programId}`).get().catch(() => null) : null;
  const dpw = Number(prog?.data()?.daysPerWeek);
  const plannedPerWeek = Number.isFinite(dpw) && dpw > 0 ? Math.min(7, dpw) : null;
  // Week and day buckets in the member's own time zone (tzo = the browser's
  // getTimezoneOffset). In UTC a Sunday-evening session in the US fell into
  // the next week and an evening meal counted on the following day.
  const tzoRaw = Number(req.nextUrl.searchParams.get('tzo'));
  const tzoMs = (Number.isFinite(tzoRaw) && Math.abs(tzoRaw) <= 840 ? tzoRaw : 0) * 60_000;
  const events: RawEvent[] = eventsSnap.docs.map((d) => {
    const e = d.data();
    const at = (e.createdAt as Timestamp | undefined)?.toMillis() ?? 0;
    return { type: String(e.type), at: at ? at - tzoMs : 0, payload: (e.payload ?? {}) as Record<string, unknown> };
  });
  const health: RawHealthDay[] = healthSnaps.filter((s) => s.exists).map((s) => dropAndroidHeart(s.data() as RawHealthDay & { source?: string }));

  const stats = computeWeekStats(week, events, health, {
    goals: u.goals as { calories?: number; protein?: number } | undefined,
    plannedPerWeek,
    streak: Number((u.statsCache as { streak?: number } | undefined)?.streak ?? 0),
    programName: ap?.programName ?? null,
    programPct: ap?.totalWorkouts ? Math.round(((ap.completedWorkouts ?? 0) / ap.totalWorkouts) * 100) : null,
  });
  if (quietWeek(stats)) {
    // Remembered, so the next visits that week do not recompute it. The
    // week is over, so nothing logged later can change it.
    await ref.set({ week, quiet: true, userId: auth.uid, createdAt: Timestamp.now() });
    return NextResponse.json({ report: null, reason: 'quiet', week });
  }

  let words = rulesReport(stats);
  let generatedBy: WeeklyReport['generatedBy'] = 'rules';
  const apiKey = await getSecret('OPENAI_API_KEY');
  // Counts against the app-wide AI budget; over it, the rules version is used.
  const usage = apiKey ? await checkAndIncrementUsage(app, auth.uid, 'weekly-report', 3, resolveLocalDate(req)).catch(() => ({ allowed: false })) : { allowed: false };
  if (apiKey && usage.allowed) {
    try {
      const openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
      const res = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0.6,
        max_tokens: 450,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: REPORT_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ goal: u.fitnessGoal ?? null, name: u.displayName ?? null, stats }) },
        ],
      });
      const parsed = parseReport(res.choices[0]?.message?.content ?? '');
      if (parsed) { words = parsed; generatedBy = 'ai'; }
    } catch (err) { console.warn('[weekly-report] AI failed, using rules', err); }
  }

  const report: WeeklyReport = { ...words, week, stats, generatedBy };
  await ref.set({ ...report, v: REPORT_VERSION, userId: auth.uid, createdAt: Timestamp.now() });
  return NextResponse.json({ report });
}
