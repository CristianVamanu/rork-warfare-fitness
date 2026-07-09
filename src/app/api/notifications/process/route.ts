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

async function generateMotivation(userName: string, streak: number): Promise<{ title: string; body: string }> {
  const apiKey = await getSecret('OPENAI_API_KEY');
  if (!apiKey) return {
    title: 'Keep pushing!',
    body: `Hey ${userName}, consistency is the key to results. You've got this!`,
  };
  const openai = new OpenAI({ apiKey });
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
    // Verify the cron secret so only Vercel's scheduler can trigger this
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.get('authorization');
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
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

    // Load all non-admin users
    const usersSnap = await db.collection('users').get();
    const users = usersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((u: any) => u.role !== 'admin' && !u.banned);

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
        });
      } catch {
        // Non-fatal — push delivery failure shouldn't abort notification creation
      }
    };

    const oneDayAgo = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const sent: string[] = [];

    for (const user of users) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = user as any;

      try {
        // Rule: missed_workout
        // NOTE: workouts are logged as `events` docs (type=WORKOUT_COMPLETED)
        // in the current architecture, not the legacy `workoutLogs`
        // collection, which nothing writes to anymore. Query by userId+type
        // only (equality-only — no composite index needed) and filter the
        // 24h window client-side, since Firestore compound equality+range
        // queries on different fields require a manually-deployed index.
        if (rules['missed_workout'] && u.activeProgram) {
          const eventsSnap = await db.collection('events')
            .where('userId', '==', u.id)
            .where('type', '==', 'WORKOUT_COMPLETED')
            .get();
          const hasRecentWorkout = eventsSnap.docs.some((d) => {
            const createdAt = d.data().createdAt as FirebaseFirestore.Timestamp | undefined;
            return createdAt && createdAt.toMillis() >= oneDayAgo.toMillis();
          });
          if (!hasRecentWorkout) {
            const title = "Don't break the chain!";
            const body = `You haven't logged a workout today. Get back on track with ${u.activeProgram.programName}.`;
            await db.collection('notifications').add({
              userId: u.id, trainerId: u.trainerId ?? null,
              title, body, type: 'auto_missed_workout', read: false, createdAt: Timestamp.now(),
            });
            await sendPush(u.id, title, body);
            sent.push(`missed_workout:${u.id}`);
          }
        }

        // Rule: streak_reminder
        if (rules['streak_reminder']) {
          const streak = u.statsCache?.streak ?? u.stats?.streak ?? 0;
          if (streak > 0) {
            const title = `🔥 ${streak}-day streak!`;
            const body = `You're on a roll, ${u.displayName ?? 'champ'}! Keep showing up every day.`;
            await db.collection('notifications').add({
              userId: u.id, trainerId: u.trainerId ?? null,
              title, body, type: 'auto_streak', read: false, createdAt: Timestamp.now(),
            });
            await sendPush(u.id, title, body);
            sent.push(`streak:${u.id}`);
          }
        }

        // Rule: ai_motivation
        if (aiEnabled) {
          const streak = u.statsCache?.streak ?? u.stats?.streak ?? 0;
          const msg = await generateMotivation(u.displayName ?? 'champ', streak);
          await db.collection('notifications').add({
            userId: u.id, trainerId: u.trainerId ?? null,
            title: msg.title, body: msg.body, type: 'ai_motivation', read: false, createdAt: Timestamp.now(),
          });
          await sendPush(u.id, msg.title, msg.body);
          sent.push(`ai_motivation:${u.id}`);
        }
      } catch (err) {
        // Non-fatal per-user — one bad doc/user shouldn't abort the whole batch
        console.error(`[notifications/process] Failed for user ${u.id}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      debug: {
        rulesEnabled: rules,
        aiEnabled,
        usersConsidered: users.length,
        usersWithActiveProgram: users.filter((u) => (u as { activeProgram?: unknown }).activeProgram).length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notifications/process] Fatal error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
