import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';

const SYSTEM_PROMPT = `You are an elite strength and conditioning coach with 20+ years of experience.
Your job is to design precise, periodized weekly training programs tailored to the individual.
Programs must be scientifically sound, progressive, and specific to the user's goal, experience, and equipment.
Never give generic advice. Every exercise selection, set/rep scheme, and rest period must be intentional.`;

function buildUserPrompt(
  goal: string,
  experience: string,
  trainingDays: number,
  equipment: string,
  limitations: string
): string {
  const goalMap: Record<string, string> = {
    'lose-fat': 'fat loss while preserving muscle mass',
    'build-muscle': 'maximum hypertrophy and muscle building',
    recomposition: 'body recomposition — simultaneously building muscle and losing fat',
    strength: 'maximal strength development using progressive overload',
  };
  const equipMap: Record<string, string> = {
    'full-gym': 'a full commercial gym with barbells, dumbbells, cables, and machines',
    home: 'home equipment only — dumbbells, resistance bands, bodyweight',
    minimal: 'minimal equipment — bodyweight, one set of dumbbells, pull-up bar',
  };

  return `Design a complete ${trainingDays}-day-per-week training program for a ${experience}-level athlete with the primary goal of ${goalMap[goal] ?? goal}.
Equipment available: ${equipMap[equipment] ?? equipment}.
${limitations ? `Injury/limitations to work around: ${limitations}.` : ''}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "name": "program name (concise, goal-specific)",
  "description": "2-3 sentence description explaining the program's structure, methodology, and expected outcomes",
  "weeks": 8,
  "daysPerWeek": ${trainingDays},
  "schedule": [
    {
      "label": "Day label e.g. Push Day / Pull Day / Rest",
      "isRest": false,
      "exercises": [
        {
          "name": "Exercise name",
          "sets": 4,
          "reps": "8-10",
          "restSeconds": 90,
          "muscleGroup": "chest"
        }
      ]
    }
  ]
}

Rules:
- "schedule" must have EXACTLY 7 items (Day 1 through Day 7); labels must NOT use weekday names — use theme names like "Push Day", "Pull Day", "Leg Day", "Rest"
- Distribute ${trainingDays} training days and ${7 - trainingDays} rest days optimally across the week
- Rest day items must have "isRest": true and "exercises": []
- Each training day must have 4-7 exercises appropriate for the goal and experience level
- For ${experience} level: ${experience === 'beginner' ? 'use compound movements, 3 sets, higher reps (10-15), longer rest (90-120s)' : experience === 'intermediate' ? 'mix compound and isolation, 3-4 sets, moderate reps (8-12), standard rest (60-90s)' : 'advanced periodization, 4-5 sets, varied rep ranges, strategic deload structure'}
- "reps" can be a number or string (e.g. "8-10", "AMRAP", "30s")
- "restSeconds" is a number (seconds)
- Exercise names must be specific and standard (e.g. "Barbell Back Squat", not "Squats")`;
}

function normalizeProgram(
  raw: Record<string, unknown>,
  goal: string,
  experience: string,
  trainingDays: number,
  trainerId: string
) {
  const levelMap: Record<string, 'beginner' | 'intermediate' | 'advanced'> = {
    beginner: 'beginner',
    intermediate: 'intermediate',
    advanced: 'advanced',
  };
  const goalMap: Record<string, 'strength' | 'hypertrophy' | 'endurance' | 'weight-loss' | 'general'> = {
    strength: 'strength',
    'build-muscle': 'hypertrophy',
    recomposition: 'general',
    'lose-fat': 'weight-loss',
  };

  const schedule = (raw.schedule as unknown[]) ?? [];

  // Ensure exactly 7 days
  while (schedule.length < 7) {
    schedule.push({ label: 'Rest', isRest: true, exercises: [] });
  }

  const normalizedSchedule = schedule.slice(0, 7).map((day: unknown, i: number) => {
    const d = day as Record<string, unknown>;
    const exercises = ((d.exercises as unknown[]) ?? []).map((ex: unknown, j: number) => {
      const e = ex as Record<string, unknown>;
      return {
        id: `ex-${i}-${j}`,
        name: String(e.name ?? 'Exercise'),
        sets: Number(e.sets ?? 3),
        reps: e.reps ?? 10,
        restSeconds: Number(e.restSeconds ?? 60),
        muscleGroup: String(e.muscleGroup ?? ''),
      };
    });
    return {
      label: String(d.label ?? (d.isRest ? 'Rest' : `Day ${i + 1}`)),
      isRest: Boolean(d.isRest),
      exercises,
    };
  });

  // Flat exercise list for session page compatibility
  const allExercises = normalizedSchedule
    .filter((d) => !d.isRest)
    .flatMap((d) => d.exercises);

  return {
    name: String(raw.name ?? 'Custom AI Program'),
    description: String(raw.description ?? ''),
    level: levelMap[experience] ?? 'intermediate',
    goal: goalMap[goal] ?? 'general',
    weeks: Number(raw.weeks ?? 8),
    daysPerWeek: trainingDays,
    exercises: allExercises,
    schedule: normalizedSchedule,
    createdBy: trainerId,
    trainerId,
    isPublic: false,
    aiGenerated: true,
  };
}

export async function POST(req: NextRequest) {
  const apiKey = await getSecret('OPENAI_API_KEY');
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { goal, experience, trainingDays, equipment, limitations = '', trainerId = '' } = body as {
      goal: string;
      experience: string;
      trainingDays: number;
      equipment: string;
      limitations?: string;
      trainerId?: string;
    };

    if (!goal || !experience || !trainingDays || !equipment) {
      return NextResponse.json({ error: 'Missing required fields: goal, experience, trainingDays, equipment' }, { status: 400 });
    }

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 3000,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(goal, experience, trainingDays, equipment, limitations) },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() ?? '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI returned invalid format');

    const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const program = normalizeProgram(raw, goal, experience, trainingDays, trainerId);

    return NextResponse.json({ program });
  } catch (err: unknown) {
    console.error('[recommend-program] Error:', err);
    const message = err instanceof Error ? err.message : 'Program generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
