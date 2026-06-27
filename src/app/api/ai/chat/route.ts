/**
 * AI Safety Layer — read-only generation endpoint.
 *
 * This route ONLY generates content. It NEVER writes to Firestore.
 * All generated content (plans, summaries, advice) must be reviewed
 * and explicitly saved by the trainer or user before any data is persisted.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const { message, systemPrompt } = await req.json();
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content:
            systemPrompt ||
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
