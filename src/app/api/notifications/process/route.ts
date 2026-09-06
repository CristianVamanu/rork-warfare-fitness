/**
 * Auto-notification processor — called daily by Vercel cron (see vercel.json).
 * Secured by CRON_SECRET header; only Vercel's cron runner can call this.
 *
 * Rules processed:
 *   missed_workout  — user hasn't logged a workout in > 1 day and has an active program
 *   streak_reminder — daily motivational nudge for users with a streak > 0
 *   ai_motivation   — AI-generated personalised message (requires OPENAI_API_KEY)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { sendEmail, trialEndingEmailHtml } from '@/lib/email';
import { timingSafeEqualString } from '@/lib/crypto';

async function generateMotivation(userName: string, streak: number): Promise<{ title: string; body: string }> {
  const apiKey = await getSecret('OPENAI_API_KEY');
  if (!apiKey) return {
    title: 'Keep pushing!',
    body: `Hey ${userName}, consistency is the key to results. You've got this!`,
  };
  const openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const res = await openai.chat.completions.create({
    model,
    max_tokens: 120,
    temperature: 0.9,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a motivational fitness coach. Return JSON: { "title": "short punchy title (max 8 words)", "body": "1-2 sentence motivational message (max 30 words)" }',
      },
      {
        role: 'user',
        content: `Write a motivational fitness notification for ${userName} who has a ${streak}-day streak.`,
      },
    ],
  });
  const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}');
  return {
    title: parsed.title || 'Keep going!',
    body: parsed.body || `Great work ${userName}! Stay consistent and results will follow.`,
  };
}

export async function POST(req: NextRequest) {
  try {
    // Verify the cron secret so only Vercel's scheduler can trigger this —
    // fails closed if it isn't configured at all, rather than skipping the
    // check entirely, which let anyone unauthenticated trigger a full
    // notification/email sweep over every user, repeatedly.
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }
    const auth = req.headers.get('authorization') ?? '';
    if (!timingSafeEqualString(auth, `Bearer ${secret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const app = getAdminApp();
    if (!app) {
      return NextResponse.json({ error: 'Firebase Admin not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.' }, { status: 500 });
    }
    const db = getAdminDb(app);

    // Load notification config
    const configSnap = await db.doc('config/notifications').get();
    const config = configSnap.data() ?? {};
    const rules: Record<string, boolean> = config.rules ?? {};
    const aiEnabled: boolean = config.aiMotivationEnabled ?? false;

    // Load membership config (trial length) + system config (app name) for the trial-ending email
    const membershipCfgSnap = await db.doc('config/membership').get();
    // paidTrialEnabled means there is no free, createdAt-anchored window at
    // all — access comes only from a Stripe subscription. Emailing "your
    // free trial ends in 2 days" to someone who never had one (and was
    // never given one) is both wrong and a support ticket, so the whole
    // block below is skipped in that mode. A paid trial's real conversion
    // warning has to come off Stripe's own trial_end / the
    // customer.subscription.trial_will_end event instead.
    const membershipCfgData = membershipCfgSnap.data();
    // Both Stripe-managed modes must skip this, not just paidTrialEnabled.
    // Under cardUpFrontTrial there is likewise no createdAt-anchored window
    // (isInFreeTrial returns false), so this block would have mailed "your
    // free trial ends in 2 days" to every account on its 5th day regardless
    // of whether they ever had a trial — including people already paying
    // through a Stripe trial, and people who never checked out at all.
    const trialIsStripeRun = membershipCfgData?.paidTrialEnabled === true
      || membershipCfgData?.cardUpFrontTrial === true;
    const trialDays: number = trialIsStripeRun ? 0 : (membershipCfgData?.trialDays ?? 0);
    const systemCfgSnap = await db.doc('system/config').get();
    const appName = (systemCfgSnap.data()?.appName as string) || 'Warfare Fitness';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';

    // Users are streamed in pages rather than loaded all at once.
    //
    // `db.collection('users').get()` pulled every user document into this one
    // Node process's memory every hour. At a few thousand members that is tens
    // of megabytes per run on a box also serving requests, and it grows with
    // signups; the array was then walked strictly sequentially, so a forced
    // run (which skips the per-hour filter) took longer than its own HTTP
    // timeout. Paging keeps memory flat, and the work inside each page runs
    // with bounded concurrency below.
    const USER_PAGE_SIZE = 300;
    async function* eachUserPage(): AsyncGenerator<Record<string, unknown>[]> {
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      for (;;) {
        let q = db.collection('users').orderBy('__name__').limit(USER_PAGE_SIZE);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        if (snap.empty) return;
        cursor = snap.docs[snap.docs.length - 1];
        yield snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => (u as { role?: string }).role !== 'admin' && !(u as { banned?: boolean }).banned);
        if (snap.size < USER_PAGE_SIZE) return;
      }
    }

    /** Runs `fn` over `items` with at most `n` in flight. */
    async function mapWithConcurrency<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
      let i = 0;
      await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (i < items.length) {
          const item = items[i++];
          await fn(item);
        }
      }));
    }

    let usersConsidered = 0;
    let usersWithActiveProgram = 0;

    // Same-machine, same-process call to /api/push/send — route it through
    // localhost, not the public domain. Going out through DNS -> Cloudflare
    // -> back to this box only adds failure points, and breaks outright if
    // this server's own DNS resolver has a stale cache (this exact bug hit
    // the sibling /api/admin/run-notifications route earlier).
    const baseUrl = process.env.INTERNAL_APP_URL ?? 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    const sendPush = async (userId: string, title: string, body: string) => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (cronSecret) headers['Authorization'] = `Bearer ${cronSecret}`;
        await fetch(`${baseUrl}/api/push/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId, title, body }),
          // A self-call: if the app is mid-reload this hangs, and the hourly
          // run stalls on one user's push instead of moving on.
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Non-fatal — push delivery failure shouldn't abort notification creation
      }
    };

    const oneDayAgo = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const sent: string[] = [];

    // Computes a user's own "today"/"yesterday" date string (YYYY-MM-DD) in
    // their stored timezone (captured at signup), not the server's — a
    // server-timezone-only comparison here previously misjudged which day a
    // logged workout fell on for anyone not in the same timezone as the VPS.
    // Falls back to UTC for pre-existing accounts with no stored timezone.
    const localDateStrFor = (timezone: string | undefined, msAgo: number): string => {
      const date = new Date(Date.now() - msAgo);
      try {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone || 'UTC' }).format(date);
      } catch {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC' }).format(date);
      }
    };

    // The cron fires HOURLY (see vercel.json) and each run only processes
    // users whose local clock currently reads the target hour — so everyone
    // gets their daily notifications at ~8am THEIR time instead of 8am UTC
    // (which was the middle of the night for US users). Users without a
    // stored timezone resolve as UTC, i.e. exactly the old behavior.
    // Half-hour timezones (e.g. India, UTC+5:30) still match: the :00 cron
    // nearest their 8am reads hour 8 on their clock.
    const TARGET_LOCAL_HOUR = 8;
    // Admin "Run Now" (admin/run-notifications) passes ?force=1 — a manual
    // trigger means "process everyone right now", not "only users whose
    // clock happens to read 8am at this moment".
    const force = req.nextUrl.searchParams.get('force') === '1';
    const localHourFor = (timezone: string | undefined): number => {
      try {
        return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'UTC', hour: 'numeric', hour12: false }).format(new Date()), 10);
      } catch {
        return new Date().getUTCHours();
      }
    };
    // Weekly recap fires once a week (Sunday, same target hour as the daily
    // rules) rather than running as its own separate cron/route — reuses the
    // exact same per-user timezone gating already proven working here
    // instead of standing up new schedule infrastructure for one rule.
    const localDayFor = (timezone: string | undefined): number => {
      try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'UTC', weekday: 'short' }).format(new Date());
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts);
      } catch {
        return new Date().getUTCDay();
      }
    };
    const WEEKLY_RECAP_DAY = 0; // Sunday

    // Identity-based framing — onboarding captures the user's actual goal
    // and it's never referenced again anywhere after that. Quoting it back
    // ("people building muscle don't skip Tuesday") sustains habits better
    // than a generic "champ" placeholder, since it's identity-based rather
    // than outcome-based motivation.
    const IDENTITY_LABEL: Record<string, string> = {
      'lose-fat': 'People cutting fat',
      'build-muscle': 'People building muscle',
      recomposition: 'People recomping',
      strength: 'Strength athletes',
    };
    const identityFor = (fitnessGoal: string | undefined) => IDENTITY_LABEL[fitnessGoal ?? ''] ?? 'Champions';

    for await (const page of eachUserPage()) {
      usersConsidered += page.length;
      usersWithActiveProgram += page.filter((u) => (u as { activeProgram?: unknown }).activeProgram).length;
      // Six at a time. Each user's work is mostly waiting — an OpenAI call, a
      // couple of Firestore queries, a push — so serialising them meant a
      // forced run over the whole member base took minutes of pure latency.
      // Kept low deliberately: this shares a box with live traffic, and the
      // OpenAI calls inside are rate-limited upstream.
      await mapWithConcurrency(page, 6, async (user) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = user as any;
      // Not this user's notification hour yet (or already past) — every
      // rule below sends at most once per matching run, so gating the whole
      // block per-hour is also what stops the hourly cron from sending the
      // same reminders 24× a day.
      if (!force && localHourFor(u.timezone) !== TARGET_LOCAL_HOUR) return;
      const today = localDateStrFor(u.timezone, 0);
      const yesterday = localDateStrFor(u.timezone, 86_400_000);

      try {
        // Rule: missed_workout
        // NOTE: workouts are logged as `events` docs (type=WORKOUT_COMPLETED)
        // in the current architecture, not the legacy `workoutLogs`
        // collection, which nothing writes to anymore. Query by userId+type
        // only (equality-only — no composite index needed) and filter the
        // 24h window client-side, since Firestore compound equality+range
        // queries on different fields require a manually-deployed index.
        // 'Any event within the last 24h' only needs the single most recent
        // one, not the user's entire workout history — an unbounded query
        // here scaled linearly with each user's lifetime event count on
        // every single cron run, with no cap on cost/latency as it grows.
        if (rules['missed_workout'] && u.activeProgram && u.lastAutoMissedWorkoutDate !== today) {
          const eventsSnap = await db.collection('events')
            .where('userId', '==', u.id)
            .where('type', '==', 'WORKOUT_COMPLETED')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
          const hasRecentWorkout = eventsSnap.docs.some((d) => {
            const createdAt = d.data().createdAt as FirebaseFirestore.Timestamp | undefined;
            return createdAt && createdAt.toMillis() >= oneDayAgo.toMillis();
          });
          if (!hasRecentWorkout) {
            // Personalize with how long it's actually been and what they've
            // already put in, instead of the same generic line regardless —
            // specific reactivation copy out-performs boilerplate.
            const lastWorkoutDate = u.statsCache?.lastWorkoutDate as string | undefined;
            const daysSince = lastWorkoutDate
              ? Math.round((new Date(today + 'T00:00:00Z').getTime() - new Date(lastWorkoutDate + 'T00:00:00Z').getTime()) / 86_400_000)
              : null;
            const totalWorkouts = u.statsCache?.totalWorkouts ?? 0;
            const gapPhrase = daysSince && daysSince > 1
              ? `It's been ${daysSince} days since your last session`
              : "You haven't logged a workout today";
            const historyPhrase = totalWorkouts >= 5 ? ` — don't let ${totalWorkouts} sessions of progress stall out` : '';
            const title = "Don't break the chain!";
            const body = `${identityFor(u.fitnessGoal)}: ${gapPhrase}${historyPhrase}. Get back on track with ${u.activeProgram.programName}.`;
            await db.collection('notifications').add({
              userId: u.id, trainerId: u.trainerId ?? null,
              title, body, type: 'auto_missed_workout', read: false, createdAt: Timestamp.now(),
            });
            await db.collection('users').doc(u.id).update({ lastAutoMissedWorkoutDate: today });
            await sendPush(u.id, title, body);
            sent.push(`missed_workout:${u.id}`);
          }
        }

        // Rule: streak_reminder
        // `stats.streak` only updates when a workout is completed, so a
        // user who stopped training days ago still has a stale positive
        // number sitting in the cache — gate this on their last workout
        // actually being today or yesterday, or this congratulates people
        // on a streak that's already dead.
        if (rules['streak_reminder'] && u.lastAutoStreakDate !== today) {
          const streak = u.statsCache?.streak ?? u.stats?.streak ?? 0;
          const lastWorkoutDate = u.statsCache?.lastWorkoutDate as string | undefined;
          const streakLive = lastWorkoutDate === today || lastWorkoutDate === yesterday;
          if (streak > 0 && streakLive) {
            const title = `🔥 ${streak}-day streak!`;
            const body = `${identityFor(u.fitnessGoal)} keep showing up. Don't stop now, ${u.displayName ?? 'champ'}.`;
            await db.collection('notifications').add({
              userId: u.id, trainerId: u.trainerId ?? null,
              title, body, type: 'auto_streak', read: false, createdAt: Timestamp.now(),
            });
            await db.collection('users').doc(u.id).update({ lastAutoStreakDate: today });
            await sendPush(u.id, title, body);
            sent.push(`streak:${u.id}`);
          }
        }

        // Rule: weekly_recap — a "highlight reel" of the week's wins
        // (workouts, volume, streak) delivered on a fixed cadence. Variable-
        // reward digests like this are a proven re-engagement trigger, and
        // everything it needs (a week-bounded events query + statsCache) is
        // already exactly the data the other rules above use.
        if (rules['weekly_recap'] && u.lastAutoWeeklyRecapDate !== today && (force || localDayFor(u.timezone) === WEEKLY_RECAP_DAY)) {
          const weekAgoTs = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
          // Bounded — nobody realistically logs more than 100 workouts in a
          // single week, and this used to fetch a user's ENTIRE lifetime
          // WORKOUT_COMPLETED history just to filter down to the last 7 days.
          const weekEventsSnap = await db.collection('events')
            .where('userId', '==', u.id)
            .where('type', '==', 'WORKOUT_COMPLETED')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
          const weekWorkouts = weekEventsSnap.docs.filter((d) => {
            const createdAt = d.data().createdAt as FirebaseFirestore.Timestamp | undefined;
            return createdAt && createdAt.toMillis() >= weekAgoTs.toMillis();
          });
          if (weekWorkouts.length > 0) {
            const weekVolume = weekWorkouts.reduce((sum, d) => sum + (Number(d.data().payload?.totalWeightLifted) || 0), 0);
            const streak = u.statsCache?.streak ?? u.stats?.streak ?? 0;
            const title = `📊 Your week: ${weekWorkouts.length} session${weekWorkouts.length !== 1 ? 's' : ''} down`;
            const volumePhrase = weekVolume > 0 ? `, ${Math.round(weekVolume).toLocaleString()}kg moved` : '';
            const streakPhrase = streak > 0 ? `, ${streak}-day streak held` : '';
            const body = `${weekWorkouts.length} workout${weekWorkouts.length !== 1 ? 's' : ''}${volumePhrase}${streakPhrase}. Keep it up this week, ${u.displayName ?? 'champ'}.`;
            await db.collection('notifications').add({
              userId: u.id, trainerId: u.trainerId ?? null,
              title, body, type: 'auto_weekly_recap', read: false, createdAt: Timestamp.now(),
            });
            await db.collection('users').doc(u.id).update({ lastAutoWeeklyRecapDate: today });
            await sendPush(u.id, title, body);
            sent.push(`weekly_recap:${u.id}`);
          }
        }

        // Rule: ai_motivation
        if (aiEnabled && u.lastAutoAiMotivationDate !== today) {
          const streak = u.statsCache?.streak ?? u.stats?.streak ?? 0;
          const msg = await generateMotivation(u.displayName ?? 'champ', streak);
          await db.collection('notifications').add({
            userId: u.id, trainerId: u.trainerId ?? null,
            title: msg.title, body: msg.body, type: 'ai_motivation', read: false, createdAt: Timestamp.now(),
          });
          await db.collection('users').doc(u.id).update({ lastAutoAiMotivationDate: today });
          await sendPush(u.id, msg.title, msg.body);
          sent.push(`ai_motivation:${u.id}`);
        }

        // Trial-ending email — fires once, exactly 2 days before the free trial expires
        if (trialDays > 0 && u.membership?.status !== 'active' && u.email && u.createdAt) {
          const createdAtMs = (u.createdAt as FirebaseFirestore.Timestamp).toMillis();
          const trialEndsMs = createdAtMs + trialDays * 24 * 60 * 60 * 1000;
          const daysLeft = Math.ceil((trialEndsMs - Date.now()) / (24 * 60 * 60 * 1000));
          if (daysLeft === 2) {
            const sentFlag = 'trialEndingEmailSent';
            if (!u[sentFlag]) {
              const ok = await sendEmail({
                to: u.email,
                subject: `Your free trial ends in ${daysLeft} days`,
                html: trialEndingEmailHtml(u.displayName?.split(' ')[0] || 'there', daysLeft, appName, appUrl),
              });
              if (ok) {
                await db.collection('users').doc(u.id).update({ [sentFlag]: true });
                sent.push(`trial_ending:${u.id}`);
              }
            }
          }
        }
      } catch (err) {
        // Non-fatal per-user — one bad doc/user shouldn't abort the whole batch
        console.error(`[notifications/process] Failed for user ${u.id}:`, err);
      }
      });
    }

    return NextResponse.json({
      ok: true,
      sent,
      debug: {
        rulesEnabled: rules,
        aiEnabled,
        usersConsidered,
        usersWithActiveProgram,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notifications/process] Fatal error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
