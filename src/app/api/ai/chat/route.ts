import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const { message, systemPrompt } = await req.json();
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: systemPrompt || 'You are a professional fitness and nutrition coach. Provide concise, actionable advice.',
        },
        { role: 'user', content: message },
      ],
    });

    return NextResponse.json({ reply: response.choices[0]?.message?.content || '' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
