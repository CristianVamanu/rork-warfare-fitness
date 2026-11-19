'use client';

/**
 * The four intake questions that used to sit in the signup quiz: body type,
 * problem areas, what stopped the person before, and their one priority.
 *
 * None of them changes which program is matched, so asking them before the
 * account existed cost four screens for nothing. They are asked here, on the
 * dashboard, one question at a time and one tap each. Every answer is saved
 * the moment it is given, so leaving half-way loses nothing. The card shows
 * only the questions still unanswered and disappears when all four are in.
 * "Later" hides it for a week; the answers are wanted, not demanded.
 */
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserDoc } from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { BODY_TYPES, BLOCKERS, PRIORITIES, PROBLEM_AREAS, cleanProblemAreas, type ProblemArea } from '@/lib/onboardingIntake';

const HIDE_KEY = 'wf.intakeFollowUp.hideUntil';
const HIDE_DAYS = 7;

type Field = 'bodyType' | 'problemAreas' | 'blocker' | 'priority';

const QUESTIONS: { field: Field; title: string; sub: string; multi?: boolean; choices: { value: string; label: string; sub?: string }[] }[] = [
  { field: 'bodyType', title: 'How would you describe your body right now?', sub: 'No judgement, it is just the starting line.', choices: BODY_TYPES },
  { field: 'problemAreas', title: 'Which areas do you want to work on most?', sub: 'Choose all that apply.', multi: true, choices: PROBLEM_AREAS },
  { field: 'blocker', title: "What's actually stopped you before?", sub: 'Naming it is how you beat it this time.', choices: BLOCKERS },
  { field: 'priority', title: 'If one thing had to be your priority, what would it be?', sub: 'Everything gets trained. One thing gets the emphasis.', choices: PRIORITIES },
];

function hiddenForNow(): boolean {
  try { return Number(localStorage.getItem(HIDE_KEY) || 0) > Date.now(); } catch { return false; }
}

export function IntakeFollowUp() {
  const { user, profile, refreshProfile } = useAuth();
  const [hidden, setHidden] = useState(hiddenForNow);
  // Answers given in this sitting. The profile catches up on refresh; this
  // keeps a question from reappearing in the moment between the two.
  const [answered, setAnswered] = useState<Partial<Record<Field, true>>>({});
  const [areas, setAreas] = useState<ProblemArea[]>([]);
  const [saving, setSaving] = useState(false);

  if (!user || !profile || !profile.onboardingComplete || hidden) return null;

  const has = (f: Field) => {
    if (answered[f]) return true;
    const v = (profile as unknown as Record<string, unknown>)[f];
    return f === 'problemAreas' ? cleanProblemAreas(v).length > 0 : typeof v === 'string' && v.length > 0;
  };
  const remaining = QUESTIONS.filter((q) => !has(q.field));
  if (remaining.length === 0) return null;
  const q = remaining[0];
  const done = QUESTIONS.length - remaining.length;

  async function save(field: Field, value: string | ProblemArea[]) {
    if (saving || !user) return;
    setSaving(true);
    try {
      await updateUserDoc(user.uid, { [field]: value });
      setAnswered((a) => ({ ...a, [field]: true }));
      void refreshProfile();
    } catch (err) {
      console.error('[IntakeFollowUp] save failed', err);
    } finally {
      setSaving(false);
    }
  }

  function toggleArea(v: ProblemArea) {
    setAreas((cur) => v === 'whole' ? (cur.includes('whole') ? [] : ['whole'])
      : cur.includes(v) ? cur.filter((x) => x !== v) : [...cur.filter((x) => x !== 'whole'), v]);
  }

  function later() {
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86_400_000)); } catch { /* private mode */ }
    setHidden(true);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="wf-readout text-[10px] font-bold text-accent">Sharpen your plan · {done + 1} of {QUESTIONS.length}</p>
          <h2 className="text-base font-black text-white mt-1">{q.title}</h2>
          <p className="text-xs text-text-secondary mt-0.5">{q.sub}</p>
        </div>
        <button type="button" onClick={later} aria-label="Ask me later" className="p-1 -m-1 text-text-tertiary hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {q.choices.map((c) => {
          const on = q.multi && areas.includes(c.value as ProblemArea);
          return (
            <button
              key={c.value}
              type="button"
              disabled={saving}
              onClick={() => (q.multi ? toggleArea(c.value as ProblemArea) : save(q.field, c.value))}
              className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60 ${on ? 'border-accent bg-accent-muted text-white' : 'border-white/10 bg-surface text-text-secondary hover:text-white hover:border-white/25'}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {q.multi && (
        <button
          type="button"
          disabled={saving || areas.length === 0}
          onClick={() => save('problemAreas', areas)}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-black text-sm font-bold disabled:opacity-40"
        >
          <Check className="w-4 h-4" /> Save
        </button>
      )}
    </Card>
  );
}
