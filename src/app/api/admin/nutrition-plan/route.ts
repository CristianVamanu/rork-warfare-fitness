export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin/trainer-only: generates a personalized nutrition plan for a specific
 * client using AI, grounded in their real onboarding data (goal, experience,
 * sex, age, height, weight, limitations). Returns a draft for the trainer to
 * review/edit before assigning — never auto-assigns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp } from '@/lib/firebase-admin';
import { getSecret } from '@/lib/secrets';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { userId, trainerNotes } = await req.json() as { userId: string; trainerNotes?: string };
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const userSnap = await getFirestore(app).collection('users').doc(userId).get();
  if (!userSnap.exists) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  const u = userSnap.data()!;

  const apiKey = await getSecret('OPENAI_API_KEY');
  if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured. Add it in Admin → Integrations.' }, { status: 500 });

  const profileLines = [
    u.fitnessGoal ? `Goal: ${u.fitnessGoal}` : null,
    u.experience ? `Training experience: ${u.experience}` : null,
    u.sex && u.sex !== 'prefer-not-to-say' ? `Sex: ${u.sex}` : null,
    u.age ? `Age: ${u.age}` : null,
    u.heightCm ? `Height: ${u.heightCm}cm` : null,
    u.currentWeightKg ? `Weight: ${u.currentWeightKg}kg` : null,
    u.limitations ? `Limitations/allergies/dislikes: ${u.limitations}` : null,
    u.goals?.calories ? `Current calorie target: ${u.goals.calories}kcal` : null,
  ].filter(Boolean).join('\n');

  const prompt = `Create a personalized daily nutrition plan for this client:
${profileLines || 'No detailed profile available — use sensible general defaults.'}
${trainerNotes ? `\nTrainer's specific instructions: ${trainerNotes}` : ''}

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "calories": <number>,
  "protein": <number, grams>,
  "carbs": <number, grams>,
  "fat": <number, grams>,
  "meals": [
    { "name": "Breakfast", "items": ["item with quantity", "item with quantity"], "calories": <number> }
  ],
  "coachNotes": "2-3 sentences of practical guidance for this specific client"
}

Include 4-5 meals/snacks covering the full day. Quantities must be realistic and specific (e.g. "150g chicken breast", not "some chicken").`;

  try {
    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const response = await openai.chat.completions.create({
      model,
      max_tokens: 1500,
      temperature: 0.6,
      messages: [
        { role: 'system', content: 'You are a registered dietitian and sports nutrition coach. Always return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');

    const plan = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate nutrition plan';
    console.error('[nutrition-plan] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
