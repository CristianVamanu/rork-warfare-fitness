/**
 * AI Safety Layer — read-only generation endpoint.
 *
 * This route ONLY generates content. It NEVER writes to Firestore.
 * All generated content (plans, summaries, advice) must be reviewed
 * and explicitly saved by the trainer or user before any data is persisted.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp } from '@/lib/firebase-admin';
import { checkAndIncrementUsage, resolveLocalDate } from '@/lib/usageLimit';
import { verifyFeatureAccess } from '@/lib/verifyFeatureAccess';

export async function POST(req: NextRequest) {
  // No current caller in the app uses this route, but it was reachable by
  // anyone with zero auth and zero rate-limiting — an open tap on the
  // OpenAI bill for whoever found the URL. Locked down even though it's
  // currently unused, on the assumption an unauthenticated AI endpoint is
  // never intentional.
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  // The per-user daily cap below only throttles a member's usage — it never
  // checked whether this account is actually entitled to a paid AI tool at
  // all, unlike its sibling routes (analyze-food, meal-ideas, scan-and-go,
  // barcode). A non-member (or a plan without AI Chat) could get 30 free
  // GPT calls/day, bypassing the membership paywall entirely.
  const access = await verifyFeatureAccess(app, authCheck.uid, 'ai-chat');
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });

  const usage = await checkAndIncrementUsage(app, authCheck.uid, 'ai-chat', 30, resolveLocalDate(req));
  if (!usage.allowed) {
    return NextResponse.json({ error: 'Daily limit reached. Try again tomorrow.' }, { status: 429 });
  }

  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    const apiKey = await getSecret('OPENAI_API_KEY');
    if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const openai = new OpenAI({ apiKey, timeout: 30_000 });

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 600,
      messages: [
        {
          // No longer accepts a client-supplied systemPrompt — this is a
          // fixed fitness-coach endpoint, not a general instruction-
          // following proxy. A caller could otherwise send any system
          // prompt they wanted and use this app's authenticated identity
          // and OpenAI budget for arbitrary, unrelated completions.
          role: 'system',
          content:
            'You are a professional fitness and nutrition coach. Provide concise, actionable advice. ' +
            'When generating workout or nutrition plans, return structured JSON so the trainer can review and save them.',
        },
        { role: 'user', content: message },
      ],
    });

    // Returns generated content only — caller decides whether to persist
    return NextResponse.json({ reply: response.choices[0]?.message?.content ?? '' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chat failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
