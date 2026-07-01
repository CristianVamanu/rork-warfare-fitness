export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase-admin';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';

function todayKey() {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
}

export async function GET() {
  const dateKey = todayKey();

  // Try to serve from Firestore cache first
  const app = getAdminApp();
  if (app) {
    try {
      const db = getFirestore(app);
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
        const db = getFirestore(app);
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
