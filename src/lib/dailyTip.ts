import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';

/**
 * The daily brief on the dashboard.
 *
 * One tip per calendar day, shared by everyone and written once. Generation is
 * automatic: the first request of a new day finds no document and makes one.
 * The admin panel can also force a new one for today, which is the same code
 * path with the cache read skipped, so the two can never drift.
 */

/** About 18 words. The card shows the tip in full, so this is what keeps it to two lines on a phone. */
export const MAX_TIP_CHARS = 130;

export function todayKey(): string {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
}

/**
 * The MEMBER'S date, not the server's, within a day either side.
 *
 * The key used to be the server's local date, so a member ahead of UTC who
 * opened the app just after their midnight was handed yesterday's tip. The
 * bound is what stops the parameter being used to farm generations for dates
 * that are not nearly today.
 */
export function resolveDateKey(requested: string | null | undefined, serverKey = todayKey()): string {
  if (!requested || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return serverKey;
  const asked = new Date(`${requested}T00:00:00Z`).getTime();
  const server = new Date(`${serverKey}T00:00:00Z`).getTime();
  return Math.abs(asked - server) <= 86_400_000 ? requested : serverKey;
}

/** Deterministic per day, so every server instance picks the same subject. */
export function topicFor(dateKey: string): string {
  const topics = [
    'progressive overload', 'sleep and recovery', 'protein intake', 'hydration',
    'compound movements', 'rest days', 'warm-up routine', 'mind-muscle connection',
    'nutrition timing', 'consistency over intensity', 'grip strength', 'mobility work',
    'breathing technique', 'tempo training', 'caloric deficit', 'meal prep',
    'deload weeks', 'cardio timing', 'stretching', 'form over weight',
  ];
  const dayNumber = Math.floor(new Date(`${dateKey}T00:00:00Z`).getTime() / 86_400_000);
  return topics[((dayNumber % topics.length) + topics.length) % topics.length];
}

/**
 * Today's stored tip, or null.
 *
 * Length is enforced on read as well as on generation. The cache holds one tip
 * for everyone all day, so one generated under an older, looser prompt would
 * keep being served; treating an over-long one as a miss fixes the day at once.
 */
export async function readStoredTip(db: Firestore, dateKey: string): Promise<string | null> {
  try {
    const data = (await db.doc(`dailyTips/${dateKey}`).get()).data();
    if (data?.date === dateKey && typeof data.tip === 'string' && data.tip.length <= MAX_TIP_CHARS) {
      return data.tip;
    }
  } catch { /* treated as a miss */ }
  return null;
}

/** The last few days' tips, so the model can be told what not to say again. */
async function recentTips(db: Firestore, dateKey: string, alsoAvoid?: string | null): Promise<string[]> {
  const out: string[] = [];
  if (alsoAvoid) out.push(alsoAvoid);
  try {
    const base = new Date(`${dateKey}T00:00:00Z`).getTime();
    const keys = [1, 2, 3].map((n) => new Date(base - n * 86_400_000).toISOString().slice(0, 10));
    const snaps = await db.getAll(...keys.map((k) => db.doc(`dailyTips/${k}`)));
    for (const sn of snaps) {
      const t = sn.data()?.tip;
      if (typeof t === 'string' && t) out.push(t);
    }
  } catch { /* best effort — a repeat is better than no tip */ }
  return out;
}

/** Used when there is no API key, or the model call fails. */
export function fallbackTip(topic: string): string {
  return `Work on your ${topic} today — small consistent gains compound faster than big rare ones.`;
}

/**
 * Writes a new tip for `dateKey` and returns it.
 *
 * `avoid` is the tip being replaced. Without it, regenerating by hand can hand
 * back the very sentence the admin pressed the button to get rid of — adjacent
 * topics overlap and the model has no memory between calls.
 */
export async function generateAndStoreTip(
  db: Firestore | null,
  dateKey: string,
  avoid?: string | null,
): Promise<{ tip: string; generated: boolean }> {
  const topic = topicFor(dateKey);
  const apiKey = await getSecret('OPENAI_API_KEY');
  if (!apiKey) return { tip: fallbackTip(topic), generated: false };

  const recent = db ? await recentTips(db, dateKey, avoid) : (avoid ? [avoid] : []);
  const openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      max_tokens: 48,
      temperature: 0.95,
      messages: [
        {
          role: 'system',
          content: 'You are a concise fitness coach. Give ONE practical gym/fitness tip as a SINGLE sentence of at most 18 words. No fluff, no greetings, no hashtags, no lists. Fitness and gym content only.',
        },
        {
          role: 'user',
          content: `Date: ${dateKey}. Give a fitness tip about: ${topic}. One sentence, 18 words maximum.`
            + (recent.length ? `\nDo not repeat or rephrase any of these recent tips:\n- ${recent.join('\n- ')}` : ''),
        },
      ],
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? '';
    if (!raw) throw new Error('empty response');

    // Keep the first sentence if the model ran long, then hard-cap it. Without
    // the cap an over-long first sentence was still cached, and the read path
    // treated it as a miss — so every dashboard load regenerated and paid for
    // a new tip until one happened to come in short.
    const firstSentence = raw.match(/^[^.!?]*[.!?]/)?.[0]?.trim() ?? raw;
    const tip = firstSentence.length <= MAX_TIP_CHARS
      ? firstSentence
      // One short of the cap, so the ellipsis cannot push it back over and
      // re-trigger that same loop.
      : `${firstSentence.slice(0, MAX_TIP_CHARS - 1).replace(/\s+\S*$/, '').trim()}…`;

    if (db) {
      try {
        await db.doc(`dailyTips/${dateKey}`).set({ tip, date: dateKey, updatedAt: Timestamp.now() });
      } catch { /* non-fatal: a tip nobody stored is still a tip */ }
    }
    return { tip, generated: true };
  } catch (err) {
    console.error('[dailyTip] generation failed:', err instanceof Error ? err.message : err);
    return { tip: fallbackTip(topic), generated: false };
  }
}
