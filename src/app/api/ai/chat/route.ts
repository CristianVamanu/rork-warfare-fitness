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
import { checkAndIncrementUsage, refundUsage, resolveLocalDate, ORG_BUDGET_MSG } from '@/lib/usageLimit';
import { verifyFeatureAccess } from '@/lib/verifyFeatureAccess';

const MAX_MESSAGE_CHARS = 2_000;

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

  // Validate BEFORE counting usage: an empty or oversized message used to
  // burn one of the day's 30 turns before being rejected.
  const { message } = await req.json().catch(() => ({})) as { message?: unknown };
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }
  // Nothing on this screen needs more than a paragraph or two; without a
  // cap one request could carry a hundred thousand characters of tokens.
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: `Keep it under ${MAX_MESSAGE_CHARS.toLocaleString()} characters.` }, { status: 413 });
  }

  const apiKey = await getSecret('OPENAI_API_KEY');
  if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });

  const today = resolveLocalDate(req);
  const usage = await checkAndIncrementUsage(app, authCheck.uid, 'ai-chat', 30, today);
  if (!usage.allowed) {
    return NextResponse.json({ error: usage.orgLimitReached ? ORG_BUDGET_MSG : 'Daily limit reached. Try again tomorrow.' }, { status: 429 });
  }

  try {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });

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
          content: 'You are a professional fitness and nutrition coach. Provide concise, actionable advice.',
        },
        { role: 'user', content: message },
      ],
    });

    // Returns generated content only — caller decides whether to persist
    return NextResponse.json({ reply: response.choices[0]?.message?.content ?? '' });
  } catch (err: unknown) {
    // A failed call is not a used turn — every other AI route refunds; this
    // one silently charged the member's daily quota for OpenAI's outages.
    await refundUsage(app, authCheck.uid, 'ai-chat', today).catch(() => {});
    // Log the provider's message; never return it. It names models, quota
    // state and account details that are ours, not the member's.
    console.error('[ai/chat] OpenAI call failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'The coach is unavailable right now. Try again in a moment.' }, { status: 502 });
  }
}
