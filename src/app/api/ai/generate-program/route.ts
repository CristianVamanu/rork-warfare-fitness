import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSecret } from '@/lib/secrets';
import { verifyAdmin } from '@/lib/verifyAdmin';

const PLAN_SYSTEM_PROMPT = `You are an elite strength and conditioning coach with 20+ years of experience. Based on the trainer's description, design the SHAPE of a genuinely PERIODIZED workout program — not the day-by-day content yet, just its metadata and phase breakdown. Real programs progress: volume, intensity, complexity, and exercise selection should all change meaningfully from the first phase to the last, with a deload where the program length calls for one.

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
      "focus": "1-2 sentences on what this phase trains and how it differs from the phase before/after it — this is handed to a separate step that writes the actual day-by-day schedule, so be concrete about volume/intensity/exercise-selection changes"
    }
  ]
}

PHASE RULES:
- Programs of 4-5 weeks: 2 phases (e.g. Foundation, then Intensification).
- Programs of 6-9 weeks: 3 phases (e.g. Foundation, Build, Peak), with a deload built into the final week of one phase or as its own short phase if the length allows.
- Programs of 10-16 weeks: 4 phases, ALWAYS including at least one explicit deload/recovery week (roughly half the working sets/volume of the phase around it, same movements) — never string more than 6 weeks of straight progression without one.
- startWeek/endWeek across all phases must exactly cover 1 through the program's total "weeks" with no gaps or overlaps.
- "targetGender": set to "male" or "female" ONLY if the trainer's prompt explicitly says so (e.g. "female weight loss program", "program for men"); otherwise "anyone".`;

const phaseSystemPrompt = (daysPerWeek: number) => `You are an elite strength and conditioning coach continuing work on a periodized program. You've already agreed on the overall program and this specific phase's purpose — now write ONLY this one phase's 7-day weekly schedule in full detail.

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
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
- The schedule array must have EXACTLY 7 elements (Day 1 through Day 7), with exactly ${daysPerWeek} of them training days (isRest=false) and the rest isRest=true.
- Day labels must NOT reference weekdays (Monday, Tuesday, etc.) — use theme-based names like "Push Day", "Pull Day", "Leg Day", "Rest", "Active Recovery"
- Rest days: isRest=true, empty exercises array, label="Rest"
- Training days: isRest=false, 4-6 exercises per day (keep this tight — shorter, focused sessions read as more deliberate coaching than padding every day to 8 exercises)
- Include compound movements first, isolation after
- RPE 6-7 = easy/moderate, 8 = hard, 9 = very hard, 10 = max
- Rest 60-90s for hypertrophy, 120-180s for strength, 30-60s for metabolic
- Vary rep schemes based on goal (strength: 1-6 reps, hypertrophy: 8-15 reps, endurance: 15-25 reps)
- Every exercise MUST include a short "notes" tip (max 12 words) on how to perform it correctly — this is shown to the user as an in-workout info tip, so keep it punchy and actionable, not generic
- This phase must reflect its stated focus and show real progression from whatever came before it (more sets/working volume, less rest, heavier target loads implied by lower rep ranges, more advanced exercise variations or unilateral/single-limb work, and/or added complexity) — unless its focus is explicitly a deload, which does the opposite: same or similar movements, meaningfully reduced volume.
- Do NOT reuse an earlier phase's schedule verbatim with only the label changed — vary exercise selection meaningfully while respecting the phase's focus.`;

type PlanPhase = { label?: string; startWeek?: number; endWeek?: number; focus?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BDay = any;

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

    const fixSchedule = (raw: unknown): BDay[] => {
      const days = Array.isArray(raw) ? raw : [];
      while (days.length < 7) days.push({ label: 'Rest', isRest: true, dayNote: '', exercises: [] });
      return days.slice(0, 7);
    };

    // A single completion asking for the FULL day-by-day JSON of a long,
    // multi-phase program routinely needed more output than any model's
    // token ceiling allows (gpt-4o-mini caps at 16384) — raising max_tokens
    // just moved the wall, it didn't remove it, and the truncated JSON
    // failed to parse every time. Splitting generation into a small "plan"
    // call (metadata + phase outline, no day content) followed by one call
    // PER PHASE to fill in that phase's 7-day schedule keeps every single
    // completion well under the ceiling regardless of how long the overall
    // program is — a 16-week 4-phase program is now 5 small completions
    // instead of 1 giant one that can't fit.
    //
    // Streamed throughout (dots enqueued as bytes arrive) for the same
    // reason as before: keeps bytes flowing so an idle-timeout proxy
    // (nginx, Cloudflare) never sees a silent connection, even across
    // multiple sequential OpenAI calls.
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const ping = () => controller.enqueue(encoder.encode('.'));
        try {
          const planStream = await openai.chat.completions.create({
            model,
            max_tokens: 2000,
            temperature: 0.7,
            messages: [
              { role: 'system', content: PLAN_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            stream: true,
          });
          let planRaw = '';
          let planFinish: string | null = null;
          for await (const chunk of planStream) {
            const delta = chunk.choices[0]?.delta?.content ?? '';
            if (chunk.choices[0]?.finish_reason) planFinish = chunk.choices[0].finish_reason;
            if (delta) { planRaw += delta; ping(); }
          }
          if (planFinish === 'length') throw new Error('PLAN_TRUNCATED');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const plan: any = JSON.parse(planRaw);
          const daysPerWeek = Number(plan.daysPerWeek) || 4;
          const planPhases: PlanPhase[] = Array.isArray(plan.phases) && plan.phases.length > 0
            ? plan.phases
            : [{ label: 'Full Program', startWeek: 1, endWeek: Number(plan.weeks) || 8, focus: 'The whole program in one block.' }];

          const phaseSchedules: BDay[][] = [];
          for (let i = 0; i < planPhases.length; i++) {
            const ph = planPhases[i];
            const priorSummary = phaseSchedules.length > 0
              ? `\n\nPrior phase(s) already used exercises including: ${phaseSchedules.flat().flatMap((d: BDay) => (d.exercises ?? []).map((e: BDay) => e.name)).slice(0, 20).join(', ')}. Vary selection where the phase's progression calls for it.`
              : '';
            const userMsg = `Overall program: "${prompt}"\n\nProgram name: ${plan.name}\nProgram goal: ${plan.goal}, level: ${plan.level}\n\nNow write the schedule for: ${ph.label} (weeks ${ph.startWeek}-${ph.endWeek})\nThis phase's focus: ${ph.focus}${priorSummary}`;

            const phaseStream = await openai.chat.completions.create({
              model,
              max_tokens: 4000,
              temperature: 0.7,
              messages: [
                { role: 'system', content: phaseSystemPrompt(daysPerWeek) },
                { role: 'user', content: userMsg },
              ],
              response_format: { type: 'json_object' },
              stream: true,
            });
            let phaseRaw = '';
            let phaseFinish: string | null = null;
            for await (const chunk of phaseStream) {
              const delta = chunk.choices[0]?.delta?.content ?? '';
              if (chunk.choices[0]?.finish_reason) phaseFinish = chunk.choices[0].finish_reason;
              if (delta) { phaseRaw += delta; ping(); }
            }
            if (phaseFinish === 'length') throw new Error('PHASE_TRUNCATED');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const phaseData: any = JSON.parse(phaseRaw);
            phaseSchedules.push(fixSchedule(phaseData.schedule));
          }

          // The model's plan JSON occasionally omits `weeks`, or `daysPerWeek`
          // disagrees with how many training days a phase call actually
          // produced (each phase is its own separate completion, so nothing
          // forces them to agree) — fall back / reconcile against what was
          // actually generated so the saved program's stats aren't
          // silently wrong.
          const weeks = Number(plan.weeks) || 8;
          const actualDaysPerWeek = phaseSchedules[0]?.filter((d) => !d.isRest).length || daysPerWeek;

          const program = {
            name: plan.name,
            description: plan.description,
            level: plan.level,
            goal: plan.goal,
            targetGender: plan.targetGender,
            weeks,
            daysPerWeek: actualDaysPerWeek,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            phases: planPhases.map((p, i) => ({
              id: `ai-ph${i + 1}`,
              label: p.label || `Phase ${i + 1}`,
              startWeek: Number(p.startWeek) || 1,
              endWeek: Number(p.endWeek) || weeks,
              schedule: phaseSchedules[i],
            })),
            // phases[0]'s schedule doubles as the top-level `schedule`
            // fallback for any code path that reads program.schedule
            // directly instead of going through phases — same convention
            // used by every hand-built phased program already in the app.
            schedule: phaseSchedules[0],
          };

          // A control marker the client splits on — everything before it is
          // just keep-alive dots, everything after is the real payload.
          controller.enqueue(encoder.encode('\n__RESULT__\n' + JSON.stringify({ program })));
        } catch (err) {
          const truncated = err instanceof Error && (err.message === 'PLAN_TRUNCATED' || err.message === 'PHASE_TRUNCATED');
          console.error('[generate-program] error:', err, truncated ? '(hit max_tokens on ' + (err as Error).message + ')' : '');
          controller.enqueue(encoder.encode('\n__RESULT__\n' + JSON.stringify({
            error: truncated
              ? 'One part of the program was too detailed to generate in one go — try fewer weeks/days per week, or a shorter prompt.'
              : 'Failed to generate program',
          })));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // nginx buffers proxied responses by default (proxy_buffering on) —
        // it can hold the entire stream of keep-alive dots until its buffer
        // fills or the response ends, defeating streaming outright and
        // making bytes arrive in one delayed burst instead of continuously.
        // That's indistinguishable from a real stall to the client's idle
        // timeout. This header tells nginx to forward each chunk the moment
        // it arrives, no config change needed on the server side.
        'X-Accel-Buffering': 'no',
        // Some hosting layers also transform/buffer based on this; belt and
        // braces alongside X-Accel-Buffering.
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    console.error('[generate-program]', err);
    return NextResponse.json({ error: 'Failed to generate program' }, { status: 500 });
  }
}
