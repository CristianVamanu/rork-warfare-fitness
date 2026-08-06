import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { verifyAdmin } from '@/lib/verifyAdmin';

const SYSTEM_PROMPT = `You are an elite strength and conditioning coach with 20+ years of experience. Generate a detailed, genuinely PERIODIZED workout program based on the trainer's description — not one static week repeated for the whole program length. Real programs progress: volume, intensity, complexity, and exercise selection should all change meaningfully from the first phase to the last, with a deload where the program length calls for one.

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "name": "Program Name",
  "description": "2-4 sentence description of the program philosophy, goals, and how it progresses phase to phase",
  "level": "beginner" | "intermediate" | "advanced",
  "goal": "strength" | "hypertrophy" | "endurance" | "weight-loss" | "general",
  "targetGender": "male" | "female" | "anyone",
  "weeks": <number 4-16>,
  "daysPerWeek": <number 2-6>,
  "phases": [
    {
      "label": "e.g. Phase 1: Foundation",
      "startWeek": <number, 1-indexed inclusive>,
      "endWeek": <number, 1-indexed inclusive>,
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
  ]
}

PHASE RULES:
- Programs of 4-5 weeks: 2 phases (e.g. Foundation, then Intensification).
- Programs of 6-9 weeks: 3 phases (e.g. Foundation, Build, Peak), with a deload built into the final week of one phase or as its own short phase if the length allows.
- Programs of 10-16 weeks: 4-6 phases, ALWAYS including at least one explicit deload/recovery week (roughly half the working sets/volume of the phase around it, same movements) — never string more than 6 weeks of straight progression without one.
- startWeek/endWeek across all phases must exactly cover 1 through the program's total "weeks" with no gaps or overlaps.
- Every phase must have a genuinely distinct schedule reflecting its purpose — do NOT reuse an identical schedule across phases with only the label changed. Later phases should show real progression from earlier ones: more sets/working volume, less rest, heavier target loads implied by lower rep ranges, more advanced exercise variations or unilateral/single-limb work, and/or added complexity (supersets noted in "notes", tighter rest periods, etc). A deload phase/week does the opposite: same or similar movements, meaningfully reduced volume.
- Each phase's schedule array must have EXACTLY 7 elements (Day 1 through Day 7).

RULES:
- Day labels must NOT reference weekdays (Monday, Tuesday, etc.) — use theme-based names like "Push Day", "Pull Day", "Leg Day", "Rest", "Active Recovery"
- Rest days: isRest=true, empty exercises array, label="Rest"
- Training days: isRest=false, 4-6 exercises per day (keep this tight — a multi-phase program already has a lot of days to cover, and shorter, focused sessions read as more deliberate coaching than padding every day to 8 exercises)
- Include compound movements first, isolation after
- RPE 6-7 = easy/moderate, 8 = hard, 9 = very hard, 10 = max
- Rest 60-90s for hypertrophy, 120-180s for strength, 30-60s for metabolic
- Vary rep schemes based on goal (strength: 1-6 reps, hypertrophy: 8-15 reps, endurance: 15-25 reps)
- Every exercise MUST include a short "notes" tip (max 12 words) on how to perform it correctly — this is shown to the user as an in-workout info tip, so keep it punchy and actionable, not generic
- "targetGender": set to "male" or "female" ONLY if the trainer's prompt explicitly says so (e.g. "female weight loss program", "program for men"); otherwise "anyone". When a gender is specified, this is the trainer's own explicit call for who they're building this specific program for — respect it, but never assume a compound lift (squat, deadlift, pull-up, bench, overhead press) is inappropriate for a stated gender. Instead adjust via standard programming levers: starting load/volume assumptions, exercise regressions for a beginner audience (e.g. banded/assisted pull-ups, goblet squat before barbell back squat) if the prompt implies a beginner population, and rep ranges — not by removing fundamental movement patterns based on gender alone.`;

export async function POST(req: NextRequest) {
  const authCheck = await verifyAdmin(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });

  try {
    const { prompt } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'Prompt required' }, { status: 400 });

    const apiKey = await getSecret('OPENAI_API_KEY');
    if (!apiKey) return NextResponse.json({ error: 'OpenAI not configured. Set OPENAI_API_KEY in Vercel environment variables.' }, { status: 500 });

    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const response = await openai.chat.completions.create({
      model,
      // A multi-phase program is meaningfully larger than the old
      // single-schedule output — 4000 risked truncation on longer programs,
      // but 12000 made the request slow enough to hit a silent timeout
      // somewhere in the network path (reported as "generating... nothing
      // happens", no error at all). 8000 is the middle ground: enough
      // headroom for a 5-6 phase program with 4-6 exercises/day, without
      // pushing generation time so high it risks the same failure mode.
      max_tokens: 8000,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    const program = JSON.parse(content);

    const fixSchedule = (raw: unknown): unknown[] => {
      const days = Array.isArray(raw) ? raw : [];
      while (days.length < 7) days.push({ label: 'Rest', isRest: true, dayNote: '', exercises: [] });
      return days.slice(0, 7);
    };

    if (Array.isArray(program.phases) && program.phases.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      program.phases = (program.phases as any[]).map((p, i) => ({
        id: `ai-ph${i + 1}`,
        label: p.label || `Phase ${i + 1}`,
        startWeek: Number(p.startWeek) || 1,
        endWeek: Number(p.endWeek) || program.weeks || 8,
        schedule: fixSchedule(p.schedule),
      }));
      // phases[0]'s schedule doubles as the top-level `schedule` fallback for
      // any code path that reads program.schedule directly instead of going
      // through phases — same convention used by every hand-built phased
      // program already in the app.
      program.schedule = program.phases[0].schedule;
    } else {
      // Model didn't return phases (short program, or fell back on an older
      // shape) — repair the flat schedule the same way as before.
      program.schedule = fixSchedule(program.schedule);
    }

    return NextResponse.json({ program });
  } catch (err) {
    console.error('[generate-program]', err);
    return NextResponse.json({ error: 'Failed to generate program' }, { status: 500 });
  }
}
