export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { verifyAuthed } from '@/lib/verifyAdmin';

function todayKey() {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
}

// Was fully unauthenticated with no rate limiting — anyone could hit it
// directly to burn OpenAI spend once the daily cache missed. Result is
// shared across all users (cached at config/dailyTip, one doc per day), so
// this only needs to gate who can trigger generation, not per-user usage.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  requestLog.set(key, timestamps);
  if (requestLog.size > 5000) requestLog.clear();
  return timestamps.length > MAX_PER_WINDOW;
}

export async function GET(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  if (isRateLimited(check.uid)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const dateKey = todayKey();

  // Try to serve from Firestore cache first
  const app = getAdminApp();
  if (app) {
    try {
      const db = getAdminDb(app);
      const snap = await db.doc(`config/dailyTip`).get();
      const data = snap.data();
      if (data?.date === dateKey && data?.tip) {
        return NextResponse.json({ tip: data.tip, date: dateKey, cached: true });
      }
    } catch {
      // Cache miss — generate fresh
    }
  }

  const apiKey = await getSecret('OPENAI_API_KEY');
  if (!apiKey) {
    return NextResponse.json({
      tip: 'Focus on compound movements like squats, deadlifts and bench press — they build more muscle and burn more calories than isolation exercises.',
      date: dateKey,
    });
  }

  const openai = new OpenAI({ apiKey });

  // Use the date as a seed so the tip is deterministic per day across server instances
  const dayNumber = Math.floor(Date.now() / 86400000);
  const topics = [
    'progressive overload', 'sleep and recovery', 'protein intake', 'hydration',
    'compound movements', 'rest days', 'warm-up routine', 'mind-muscle connection',
    'nutrition timing', 'consistency over intensity', 'grip strength', 'mobility work',
    'breathing technique', 'tempo training', 'caloric deficit', 'meal prep',
    'deload weeks', 'cardio timing', 'stretching', 'form over weight',
  ];
  const topic = topics[dayNumber % topics.length];

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      max_tokens: 80,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: 'You are a concise fitness coach. Give one practical, gym/fitness tip in 1-2 short sentences. No fluff, no greetings, no hashtags. Fitness and gym content only.',
        },
        {
          role: 'user',
          content: `Give a fitness tip about: ${topic}. Keep it under 35 words.`,
        },
      ],
    });

    const tip = res.choices[0]?.message?.content?.trim() ?? '';
    if (!tip) throw new Error('empty response');

    // Cache in Firestore for the rest of the day
    if (app) {
      try {
        const db = getAdminDb(app);
        await db.doc('config/dailyTip').set({ tip, date: dateKey, updatedAt: Timestamp.now() });
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ tip, date: dateKey });
  } catch (err) {
    console.error('[/api/ai/tip] error:', err);
    return NextResponse.json({
      tip: `Train your ${topic} today. Small consistent improvements compound into dramatic results over weeks.`,
      date: dateKey,
    });
  }
}
