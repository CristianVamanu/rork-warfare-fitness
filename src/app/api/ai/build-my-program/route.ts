import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

/**
 * Self-serve "Build Your Own Program" — lets a regular user (not just an
 * admin) generate a fully custom AI program from a short structured
 * questionnaire, instead of only ever being auto-matched to an existing one.
 * Inputs are structured fields, not a free-text prompt, both so the result
 * stays on-brand/quality-consistent and so a user can't inject arbitrary
 * instructions into the system prompt.
 *
 * The generated program is written with the Admin SDK straight to the
 * `programs` collection (client-side writes there are admin-only per
 * firestore.rules) with `visibility: 'personal'` and `ownerId` set to the
 * requesting user, then the client enrolls itself via the normal
 * enrollInProgram() call — same as any other program.
 */

const SYSTEM_PROMPT = `You are an elite strength and conditioning coach who designs personalized training programs. Generate a detailed, periodized workout program based on the athlete's own stated goals, equipment, and constraints.

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "name": "Program Name",
  "description": "2-3 sentence description of the program philosophy and goals",
  "level": "beginner" | "intermediate" | "advanced",
  "goal": "strength" | "hypertrophy" | "endurance" | "weight-loss" | "general",
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
          "notes": "How-to-perform tip, max 12 words",
          "isCardio": <true only for running/cycling/rowing/elliptical/similar, false otherwise>
        }
      ]
    }
  ]
}

RULES:
- schedule array must have EXACTLY 7 elements (Day 1 through Day 7), matching the athlete's requested training days per week — remaining days are Rest (isRest=true, empty exercises, label="Rest")
- Day labels must NOT reference weekdays — use theme-based names like "Push Day", "Leg Day", "Rest"
- Only include exercises performable with the athlete's stated available equipment
- If the athlete reported any injury/limitation, avoid high-impact or high-risk movements for that area and note safer substitutions
- Every exercise MUST include a short "notes" tip (max 12 words)
- Vary rep schemes based on goal (strength: 1-6 reps, hypertrophy: 8-15 reps, endurance: 15-25 reps)`;

export async function POST(req: NextRequest) {
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });

  try {
    const { goal, experience, trainingDays, equipment, targetFocus, sessionMinutes, limitations } = await req.json() as {
      goal: string; experience: string; trainingDays: number;
      equipment: string; targetFocus?: string; sessionMinutes?: string; limitations?: string;
    };
    if (!goal || !experience || !trainingDays || !equipment) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const apiKey = await getSecret('OPENAI_API_KEY');
    if (!apiKey) return NextResponse.json({ error: 'AI program building is not configured yet — ask your coach to set it up.' }, { status: 500 });

    const promptLines = [
      `Goal: ${goal}`,
      `Experience level: ${experience}`,
      `Training days per week: ${trainingDays}`,
      `Available equipment: ${equipment}`,
      targetFocus ? `Focus area: ${targetFocus}` : null,
      sessionMinutes ? `Preferred session length: ${sessionMinutes}` : null,
      limitations ? `Reported injuries/limitations: ${limitations}` : null,
    ].filter(Boolean).join('\n');

    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: promptLines },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    const generated = JSON.parse(content);

    if (!Array.isArray(generated.schedule) || generated.schedule.length !== 7) {
      const days = generated.schedule ?? [];
      while (days.length < 7) days.push({ label: 'Rest', isRest: true, dayNote: '', exercises: [] });
      generated.schedule = days.slice(0, 7);
    }

    // The Exercise type requires a stable `id` (used as the React key, the
    // session-tracking key, and the lookup key when patching in a fresh
    // videoUrl on resume) but the AI schema above never asked the model for
    // one, so every generated exercise previously carried `id: undefined` —
    // collapsing distinct exercises onto the same key and silently losing
    // per-exercise state (including the demo video patched in below) to
    // whichever one happened to win the collision.
    for (let d = 0; d < generated.schedule.length; d++) {
      const day = generated.schedule[d];
      for (let e = 0; e < (day.exercises ?? []).length; e++) {
        day.exercises[e].id = `custom-${d}-${e}`;
      }
    }

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
    const db = getAdminDb(app);

    // Attach demo videos from the existing exercise library wherever a name
    // matches, same as admin-created programs get — previously only ran
    // when an admin built/edited a program by hand, so every self-serve
    // "Build Your Own" program shipped with zero demo videos even for
    // common moves (squats, push-ups) the admin already has footage for.
    // Uses the Admin SDK (not the client-side matchExercisesToVideos
    // helper in lib/firestore.ts) since this route has no browser auth
    // context to satisfy that collection's normal Firestore rules.
    try {
      const librarySnap = await db.collection('exerciseLibrary').get();
      const library = librarySnap.docs.map((d) => d.data() as { name: string; aliases?: string[]; videoUrl: string });
      if (library.length > 0) {
        for (const day of generated.schedule) {
          for (const ex of day.exercises ?? []) {
            const normalized = String(ex.name).toLowerCase().trim();
            for (const entry of library) {
              const candidates = [entry.name, ...(entry.aliases ?? [])];
              const isMatch = candidates.some((c) => {
                const cn = c.toLowerCase().trim();
                return cn === normalized || normalized.includes(cn) || cn.includes(normalized);
              });
              if (isMatch) { ex.videoUrl = entry.videoUrl; break; }
            }
          }
        }
      }
    } catch (err) {
      console.error('[build-my-program] Video matching failed (non-fatal):', err);
    }

    const exercises = generated.schedule.flatMap((d: { exercises?: unknown[] }) => d.exercises ?? []);
    const docRef = await db.collection('programs').add({
      name: generated.name,
      description: generated.description,
      level: generated.level,
      goal: generated.goal,
      weeks: generated.weeks,
      daysPerWeek: generated.daysPerWeek,
      schedule: generated.schedule,
      exercises,
      isPublic: false,
      visibility: 'personal',
      ownerId: authCheck.uid,
      createdBy: authCheck.uid,
      createdAt: new Date(),
    });

    return NextResponse.json({
      program: {
        id: docRef.id,
        name: generated.name,
        description: generated.description,
        weeks: generated.weeks,
        daysPerWeek: generated.daysPerWeek,
      },
    });
  } catch (err) {
    console.error('[build-my-program]', err);
    return NextResponse.json({ error: 'Failed to build your program' }, { status: 500 });
  }
}
