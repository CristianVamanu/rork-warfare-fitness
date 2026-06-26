import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Server-side Firebase Admin for reading OpenAI key from Firestore
function getAdminDb() {
  if (getApps().length === 0) {
    // Initialize with application default credentials or service account
    // In production, set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_KEY
    try {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : null;

      if (serviceAccount) {
        initializeApp({ credential: cert(serviceAccount) });
      } else {
        initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
      }
    } catch {
      initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    }
  }
  return getFirestore();
}

async function getOpenAIKey(): Promise<{ key: string; model: string }> {
  // First try env var
  if (process.env.OPENAI_API_KEY) {
    return { key: process.env.OPENAI_API_KEY, model: 'gpt-4o-mini' };
  }
  // Fall back to Firestore config
  try {
    const adminDb = getAdminDb();
    const configDoc = await adminDb.doc('system/config').get();
    const config = configDoc.data();
    if (config?.openaiApiKey) {
      return { key: config.openaiApiKey as string, model: (config.openaiModel as string) || 'gpt-4o-mini' };
    }
  } catch {
    // ignore
  }
  throw new Error('OpenAI API key not configured');
}

export async function POST(req: NextRequest) {
  try {
    const { base64Image } = await req.json();
    if (!base64Image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const { key, model } = await getOpenAIKey();
    const openai = new OpenAI({ apiKey: key });

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this food image and return a JSON object with nutritional information.
Return ONLY valid JSON with this exact structure:
{
  "name": "food name",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "sugar": number
}
All values should be in grams (except calories in kcal). Estimate for a typical serving size.`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'low' },
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');

    const nutrition = JSON.parse(jsonMatch[0]);
    return NextResponse.json(nutrition);
  } catch (err: unknown) {
    console.error('Food analysis error:', err);
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
