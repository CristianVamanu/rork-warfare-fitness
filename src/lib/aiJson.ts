/**
 * Getting complete JSON out of a model that was asked for too much.
 *
 * Program generation is already split into small completions — a "plan"
 * call for the shape, then one call per phase for the day-by-day content —
 * precisely so no single response has to be enormous. It still failed in
 * production with PLAN_TRUNCATED: the model hit its output ceiling, the
 * JSON came back half-written, and the whole generation was thrown away
 * after the admin had waited through it.
 *
 * Two things were wrong. The ceilings were set for the shortest plausible
 * answer rather than a realistic one, and — the part that actually
 * mattered — a truncation was terminal. One verbose answer and the work
 * was lost, with nothing tried in between.
 *
 * The rule here: running out of room is a recoverable condition. Ask again,
 * once, telling the model plainly to be brief, and only give up if that
 * fails too. Bounded at one retry on purpose — an unbounded loop against a
 * model that simply cannot fit the request would spend real money learning
 * that slowly.
 */

/**
 * Appended to the system prompt on the retry.
 *
 * Aimed at the fields that actually blow the budget — prose, not structure.
 * Cutting a phase or a training day to save room would silently produce a
 * worse program, which is not a trade a retry gets to make on its own.
 */
export const BREVITY_ADDENDUM = `

IMPORTANT — YOUR PREVIOUS ATTEMPT RAN OUT OF SPACE AND WAS DISCARDED.
Return the same structure, complete, but much more concisely:
- Every prose field (description, focus, dayNote, notes) must be as short as the rules allow — one short sentence at most, never a paragraph.
- No preamble, no commentary, no markdown fences. JSON only.
- Do NOT drop phases, days or exercises to save space. Shorten the words, not the program.`;

export interface Attempt {
  /** The raw text the model produced. */
  raw: string;
  /** finish_reason === 'length' — it ran out of output tokens. */
  truncated: boolean;
}

export class TruncatedError extends Error {
  constructor(public readonly stage: string) {
    super(`${stage}_TRUNCATED`);
    this.name = 'TruncatedError';
  }
}

/**
 * Run an attempt; if it truncates, run it once more asking for brevity.
 *
 * `stage` names what was being generated ('PLAN', 'PHASE') so a failure
 * still says which half of generation gave up — the logs that surfaced this
 * bug were only useful because they named the stage.
 */
export async function withTruncationRetry(
  stage: string,
  attempt: (brief: boolean) => Promise<Attempt>,
): Promise<string> {
  const first = await attempt(false);
  if (!first.truncated) return first.raw;
  const second = await attempt(true);
  if (second.truncated) throw new TruncatedError(stage);
  return second.raw;
}

/**
 * Parse JSON that may have arrived wearing a markdown jacket.
 *
 * json_object response format makes fences unlikely rather than impossible,
 * and on the retry the prompt grows a large instruction block, which is
 * exactly the kind of nudge that occasionally tips a model back into
 * conversational habits. Cheap to tolerate; expensive to hit in production.
 */
export function parseLooseJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  const body = fenced ? fenced[1] : text;
  try {
    return JSON.parse(body);
  } catch {
    // A leading apology or trailing sign-off around otherwise valid JSON.
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end <= start) throw new SyntaxError('No JSON object found in model output');
    return JSON.parse(body.slice(start, end + 1));
  }
}
