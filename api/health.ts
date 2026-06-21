import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const openAiKey = process.env.OPENAI_API_KEY ?? '';

  let openAiStatus = 'not configured';
  let openAiError: string | null = null;

  if (openAiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${openAiKey}` },
      });
      openAiStatus = r.ok ? 'ok' : `error ${r.status}`;
      if (!r.ok) openAiError = (await r.text()).substring(0, 120);
    } catch (e: any) {
      openAiStatus = 'network error';
      openAiError = e?.message ?? null;
    }
  }

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      OPENAI_API_KEY: openAiKey ? `set (...${openAiKey.slice(-4)})` : 'MISSING ❌',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'MISSING ❌',
      EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ? 'set ✅' : 'MISSING ❌',
      EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'not set (relative URLs used)',
    },
    checks: {
      openAi: openAiStatus === 'ok' ? 'ok ✅' : `${openAiStatus} ❌`,
      ...(openAiError ? { openAiError } : {}),
    },
  });
}
