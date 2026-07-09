import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';

const SYSTEM_PROMPT = `You are an elite strength and conditioning coach with 20+ years of experience. Generate a detailed, periodized workout program based on the trainer's description.

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "name": "Program Name",
  "description": "2-3 sentence description of the program philosophy and goals",
  "level": "beginner" | "intermediate" | "advanced",
  "goal": "strength" | "hypertrophy" | "endurance" | "weight-loss" | "general",
  "targetGender": "male" | "female" | "anyone",
  "weeks": <number 4-16>,
  "daysPerWeek": <number 2-6>,
  "schedule": [
    {
      "label": "Day label e.g. Push Day / Pull Day / Rest",
      "isRest": false,
      "dayNote": "Brief coaching note for this training day",
      "exercises": [
        {
          "name": "Exercise name",
          "muscleGroup": "Primary muscle group",
          "sets": <number>,
          "reps": "e.g. 5 or 8-12 or 3-5",
          "rpe": <number 6-10>,
          "restSeconds": <number 30-300>,
          "notes": "How-to-perform tip, max 12 words, e.g. 'Keep chest up, drive through heels'",
          "isCardio": <true only for running/cycling/rowing/elliptical/similar steady-state or interval cardio work, false for everything else>
        }
      ]
    }
  ]
}

RULES:
- schedule array must have EXACTLY 7 elements (Day 1 through Day 7)
- Day labels must NOT reference weekdays (Monday, Tuesday, etc.) — use theme-based names like "Push Day", "Pull Day", "Leg Day", "Rest", "Active Recovery"
- Rest days: isRest=true, empty exercises array, label="Rest"
- Training days: isRest=false, 3-8 exercises per day
- Include compound movements first, isolation after
- RPE 6-7 = easy/moderate, 8 = hard, 9 = very hard, 10 = max
- Rest 60-90s for hypertrophy, 120-180s for strength, 30-60s for metabolic
- Vary rep schemes based on goal (strength: 1-6 reps, hypertrophy: 8-15 reps, endurance: 15-25 reps)
- Every exercise MUST include a short "notes" tip (max 12 words) on how to perform it correctly — this is shown to the user as an in-workout info tip, so keep it punchy and actionable, not generic
- "targetGender": set to "male" or "female" ONLY if the trainer's prompt explicitly says so (e.g. "female weight loss program", "program for men"); otherwise "anyone". When a gender is specified, this is the trainer's own explicit call for who they're building this specific program for — respect it, but never assume a compound lift (squat, deadlift, pull-up, bench, overhead press) is inappropriate for a stated gender. Instead adjust via standard programming levers: starting load/volume assumptions, exercise regressions for a beginner audience (e.g. banded/assisted pull-ups, goblet squat before barbell back squat) if the prompt implies a beginner population, and rep ranges — not by removing fundamental movement patterns based on gender alone.`;

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'Prompt required' }, { status: 400 });

    const apiKey = await getSecret('OPENAI_API_KEY');
    if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured. Set OPENAI_API_KEY in Vercel environment variables.' }, { status: 500 });

    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    const program = JSON.parse(content);

    // Ensure schedule has exactly 7 days
    if (!Array.isArray(program.schedule) || program.schedule.length !== 7) {
      const days = program.schedule ?? [];
      while (days.length < 7) days.push({ label: 'Rest', isRest: true, dayNote: '', exercises: [] });
      program.schedule = days.slice(0, 7);
    }

    return NextResponse.json({ program });
  } catch (err) {
    console.error('[generate-program]', err);
    return NextResponse.json({ error: 'Failed to generate program' }, { status: 500 });
  }
}
