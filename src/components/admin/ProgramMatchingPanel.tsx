'use client';

import { useState } from 'react';
import { SlidersHorizontal, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ONBOARDING_GOALS, PROGRAM_LEVELS, PROGRAM_GOALS, EQUIPMENT_OPTIONS, AGE_BRACKETS } from '@/lib/onboardingGoals';
import { readMatching, matchingEqual, describeMatching, type ProgramMatching } from '@/lib/programMatching';
import type { Program } from '@/types';

/**
 * Who this program is for — edited in place on the programs list.
 *
 * Every field the onboarding matcher reads off a program, on one row, as
 * chips. Level and category were editable only inside the full builder,
 * which opens with an AI prompt and an image upload; equipment and goal
 * recommendation had been added there too. The admin, scanning the list
 * where these show as read-only badges, reasonably concluded there was no
 * control at all. Twelve programs needed tagging and the path to each one
 * was a long page away.
 *
 * Chips rather than <select>s, everywhere. A styled native select with no
 * caret reads as static text on a phone, which is the other half of "there
 * is no toggle". A pressed chip cannot be mistaken for a label.
 *
 * Collapsed by default to one line that says what the program will reach —
 * and says loudly when equipment was never set, since that exact condition
 * is what mis-routed five of twelve programs.
 */

type Tone = 'accent' | 'neutral';

function Chip({ on, label, onClick, tone = 'accent' }: { on: boolean; label: string; onClick: () => void; tone?: Tone }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[40px] px-3 rounded-xl border text-[13px] font-semibold transition-colors ${
        on
          ? tone === 'accent'
            ? 'border-accent bg-accent/15 text-white'
            : 'border-white/40 bg-white/10 text-white'
          : 'border-white/10 bg-surface text-text-secondary hover:border-white/25'
      }`}
    >
      {label}
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="text-[11px] text-text-tertiary mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function ProgramMatchingPanel({
  program,
  onSave,
}: {
  program: Partial<Program>;
  /** Persists the fields; the caller decides update vs upsert for built-ins. */
  onSave: (m: ProgramMatching) => Promise<void>;
}) {
  const saved = readMatching(program);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProgramMatching>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = !matchingEqual(draft, saved);

  const toggle = <K extends 'suitableEquipment' | 'recommendedForGoals' | 'ageBrackets'>(key: K, v: ProgramMatching[K][number]) =>
    setDraft((d) => {
      const list = d[key] as string[];
      const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
      return { ...d, [key]: next };
    });

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  const summary = describeMatching(saved);
  const unset = saved.suitableEquipment.length === 0;

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <SlidersHorizontal className={`w-4 h-4 flex-shrink-0 ${unset ? 'text-yellow-400' : 'text-accent'}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-white">Matching</span>
          <span className={`block text-[11px] leading-snug ${unset ? 'text-yellow-400' : 'text-text-tertiary'}`}>{summary}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-text-tertiary flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4 border-t border-white/10 pt-3">
          <Row label="Level">
            {PROGRAM_LEVELS.map(({ v, label }) => (
              <Chip key={v} label={label} on={draft.level === v} tone="neutral" onClick={() => setDraft((d) => ({ ...d, level: v }))} />
            ))}
          </Row>

          <Row label="Category" hint="The fallback. Used when nobody is explicitly recommended below.">
            {PROGRAM_GOALS.map(({ v, label }) => (
              <Chip key={v} label={label} on={draft.goal === v} tone="neutral" onClick={() => setDraft((d) => ({ ...d, goal: v }))} />
            ))}
          </Row>

          <Row
            label="Recommend for these goals"
            hint="Members who pick one of these in onboarding are sent here ahead of programs that only match by category."
          >
            {ONBOARDING_GOALS.map(({ v, label }) => (
              <Chip key={v} label={label} on={draft.recommendedForGoals.includes(v)} onClick={() => toggle('recommendedForGoals', v)} />
            ))}
          </Row>

          <Row
            label="Suitable for"
            hint={draft.suitableEquipment.length
              ? 'Only members who answered one of these are matched to this program. Minimal is bodyweight and a pull-up bar; Home adds dumbbells, kettlebells and bands; Full gym adds barbells, machines and cables.'
              : 'Nothing ticked — the app will guess from the exercise names, which is how home programs end up marked full-gym.'}
          >
            {EQUIPMENT_OPTIONS.map(({ v, label }) => (
              <Chip key={v} label={label} on={draft.suitableEquipment.includes(v)} onClick={() => toggle('suitableEquipment', v)} />
            ))}
          </Row>

          <Row
            label="Ages"
            hint={draft.ageBrackets.length
              ? 'Only members in these brackets are matched to this program. Someone who did not give an age can still reach it.'
              : 'Nothing ticked — any age.'}
          >
            {AGE_BRACKETS.map(({ v, label }) => (
              <Chip key={v} label={label} on={draft.ageBrackets.includes(v)} onClick={() => toggle('ageBrackets', v)} />
            ))}
          </Row>

          <Row label="Tie-break" hint="When several programs suit a member equally, send them here.">
            <Chip
              label="Priority pick"
              on={draft.priorityPick}
              onClick={() => setDraft((d) => ({ ...d, priorityPick: !d.priorityPick }))}
            />
          </Row>

          <div className="flex items-center justify-end gap-2 pt-1">
            {dirty && !saving && (
              <button type="button" onClick={() => setDraft(saved)} className="text-xs text-text-tertiary hover:text-white px-2 py-2">
                Reset
              </button>
            )}
            <Button size="sm" onClick={save} disabled={!dirty} loading={saving}>
              <Check className="w-3.5 h-3.5" /> Save matching
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
