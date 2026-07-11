export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Personalized daily status line shown under the dashboard greeting — not
 * framed as an AI coach persona (the app's differentiator is real human
 * trainers). Cached once per user per day (on the user doc itself) so it
 * only ever calls OpenAI once per person per day, not on every dashboard
 * load. No real sleep tracker exists, so "hours since last login" is used
 * as an honest proxy for rest/gap since they were last active — the
 * prompt is instructed to treat it as such, not claim it's real sleep data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

function todayKey() {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  try {
    const { uid, name, hoursSinceLastLogin, todayLabel, isRestDay, streak } = await req.json() as {
      uid: string;
      name: string;
      hoursSinceLastLogin: number | null;
      todayLabel: string | null;
      isRestDay: boolean;
      streak: number;
    };
    if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 });

    const dateKey = todayKey();
    const app = getAdminApp();
    const db = app ? getAdminDb(app) : null;

    if (db) {
      const snap = await db.collection('users').doc(uid).get();
      const cached = snap.data()?.coachBriefing as { text?: string; date?: string } | undefined;
      if (cached?.date === dateKey && cached.text) {
        return NextResponse.json({ briefing: cached.text, cached: true });
      }
    }

    const apiKey = await getSecret('OPENAI_API_KEY');
    const gapLine = hoursSinceLastLogin === null
      ? 'This is their first session.'
      : hoursSinceLastLogin < 20
        ? `They were last active ${Math.round(hoursSinceLastLogin)}h ago — a normal daily gap.`
        : `They were last active ${Math.round(hoursSinceLastLogin / 24)} day(s) ago — longer than usual, be encouraging not judgmental.`;
    const workoutLine = isRestDay
      ? 'Today is a scheduled rest day.'
      : todayLabel ? `Today's scheduled session is "${todayLabel}".` : 'They have no active program scheduled.';

    const fallback = isRestDay
      ? `Rest day today — recovery is part of the work.`
      : todayLabel
        ? `${todayLabel} today. Show up and give it your best.`
        : `No program scheduled yet — pick one and let's get moving.`;

    if (!apiKey) {
      return NextResponse.json({ briefing: fallback });
    }

    const openai = new OpenAI({ apiKey });
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      max_tokens: 50,
      temperature: 0.8,
      messages: [
        {
          role: 'system',
          content: 'Write a single short personalized status line (1-2 sentences max) for the top of a fitness app dashboard. Direct and motivating, no fluff, no hashtags, no emoji, no greeting like "Morning" or "Hey" — the app already shows a greeting separately, right above this line. Do NOT refer to yourself as a coach or AI, and do not use first person — this app prides itself on real human trainers, so this is just a personalized status note, not a persona talking to the athlete. Reference their rest gap and today\'s session naturally and give one specific actionable cue (intensity, focus, or encouragement). Never claim to have real sleep-tracking data — the "last active" gap is just that, a gap since they opened the app.',
        },
        {
          role: 'user',
          content: `${gapLine} ${workoutLine} Current streak: ${streak} days.`,
        },
      ],
    });

    const briefing = res.choices[0]?.message?.content?.trim() || fallback;

    if (db) {
      await db.collection('users').doc(uid).update({
        coachBriefing: { text: briefing, date: dateKey, updatedAt: Timestamp.now() },
      }).catch(() => {});
    }

    return NextResponse.json({ briefing });
  } catch (err) {
    console.error('[coach-briefing] Error:', err);
    return NextResponse.json({ briefing: 'Morning. Let\'s get to work today.' });
  }
}
