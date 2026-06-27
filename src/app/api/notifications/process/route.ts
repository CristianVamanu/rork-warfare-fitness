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
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import OpenAI from 'openai';

// Lazy-init Firebase Admin so this module doesn't break if env vars are absent
function getAdminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) return null;
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

async function generateMotivation(userName: string, streak: number): Promise<{ title: string; body: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
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
  // Verify the cron secret so only Vercel's scheduler can trigger this
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: 'Firebase Admin not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.' }, { status: 500 });
  }

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

  const oneDayAgo = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const sent: string[] = [];

  for (const user of users) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = user as any;

    // Rule: missed_workout
    if (rules['missed_workout'] && u.activeProgram) {
      const logsSnap = await db.collection('workoutLogs')
        .where('userId', '==', u.id)
        .where('completedAt', '>=', oneDayAgo)
        .limit(1)
        .get();
      if (logsSnap.empty) {
        await db.collection('notifications').add({
          userId: u.id,
          trainerId: u.trainerId ?? null,
          title: "Don't break the chain!",
          body: `You haven't logged a workout today. Get back on track with ${u.activeProgram.programName}.`,
          type: 'auto_missed_workout',
          read: false,
          createdAt: Timestamp.now(),
        });
        sent.push(`missed_workout:${u.id}`);
      }
    }

    // Rule: streak_reminder
    if (rules['streak_reminder']) {
      const streak = u.statsCache?.streak ?? u.stats?.streak ?? 0;
      if (streak > 0) {
        await db.collection('notifications').add({
          userId: u.id,
          trainerId: u.trainerId ?? null,
          title: `🔥 ${streak}-day streak!`,
          body: `You're on a roll, ${u.displayName ?? 'champ'}! Keep showing up every day.`,
          type: 'auto_streak',
          read: false,
          createdAt: Timestamp.now(),
        });
        sent.push(`streak:${u.id}`);
      }
    }

    // Rule: ai_motivation
    if (aiEnabled) {
      try {
        const streak = u.statsCache?.streak ?? u.stats?.streak ?? 0;
        const msg = await generateMotivation(u.displayName ?? 'champ', streak);
        await db.collection('notifications').add({
          userId: u.id,
          trainerId: u.trainerId ?? null,
          title: msg.title,
          body: msg.body,
          type: 'ai_motivation',
          read: false,
          createdAt: Timestamp.now(),
        });
        sent.push(`ai_motivation:${u.id}`);
      } catch {
        // Non-fatal — AI generation can fail
      }
    }
  }

  return NextResponse.json({ ok: true, sent });
}
