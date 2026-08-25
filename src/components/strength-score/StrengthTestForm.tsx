'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { calculateStrengthScore, lbsToKgRounded, type StrengthInputs, type StrengthResult } from '@/lib/strengthScore';

type Unit = 'kg' | 'lbs';
export type StrengthTestFormState = {
  age: string; sex: 'male' | 'female'; bodyweight: string;
  squat: string; bench: string; deadlift: string; ohp: string; pullups: string;
  unit: Unit;
};

export const EMPTY_STRENGTH_FORM: StrengthTestFormState = {
  age: '', sex: 'male', bodyweight: '', squat: '', bench: '', deadlift: '', ohp: '', pullups: '',
  unit: 'kg',
};

function toKg(value: string, unit: Unit): number {
  const n = parseFloat(value);
  if (!n || n <= 0) return 0;
  return unit === 'kg' ? n : lbsToKgRounded(n);
}

/** Shared lift-entry form — used by the main /strength-score flow AND the
 * challenge-accept flow, so the two never drift out of sync with each other. */
export function StrengthTestForm({
  onCalculate, submitLabel = 'CALCULATE MY SCORE',
}: {
  onCalculate: (inputs: StrengthInputs, result: StrengthResult) => void;
  submitLabel?: string;
}) {
  const [form, setForm] = useState<StrengthTestFormState>(EMPTY_STRENGTH_FORM);
  function set<K extends keyof StrengthTestFormState>(key: K, value: StrengthTestFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const age = parseInt(form.age, 10);
    if (!age || age < 5 || age > 120) { toast.error('Enter a valid age'); return; }
    const bodyweightKg = toKg(form.bodyweight, form.unit);
    if (!bodyweightKg) { toast.error('Enter your bodyweight'); return; }
    const squatKg = toKg(form.squat, form.unit);
    const benchKg = toKg(form.bench, form.unit);
    const deadliftKg = toKg(form.deadlift, form.unit);
    if (!squatKg && !benchKg && !deadliftKg) { toast.error('Enter at least one main lift'); return; }
    const ohpKg = form.ohp ? toKg(form.ohp, form.unit) : undefined;
    const pullupReps = form.pullups ? parseInt(form.pullups, 10) : undefined;

    const inputs: StrengthInputs = { age, sex: form.sex, bodyweightKg, squatKg, benchKg, deadliftKg, ohpKg, pullupReps };
    try {
      const result = calculateStrengthScore(inputs);
      onCalculate(inputs, result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not calculate score');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Age" type="number" inputMode="numeric" value={form.age} onChange={(e) => set('age', e.target.value)} placeholder="28" required />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Sex</span>
            <div className="grid grid-cols-2 gap-1 bg-surface-elevated rounded-xl p-1">
              {(['male', 'female'] as const).map((s) => (
                <button
                  key={s} type="button" onClick={() => set('sex', s)}
                  className={`py-2.5 text-sm font-medium rounded-lg capitalize transition-all ${form.sex === s ? 'bg-accent text-black font-bold' : 'text-text-secondary'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">Units</span>
          <div className="grid grid-cols-2 gap-1 bg-surface-elevated rounded-xl p-1 w-32">
            {(['kg', 'lbs'] as const).map((u) => (
              <button
                key={u} type="button" onClick={() => set('unit', u)}
                className={`py-1.5 text-xs font-bold rounded-lg uppercase transition-all ${form.unit === u ? 'bg-accent text-black' : 'text-text-secondary'}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <Input label={`Bodyweight (${form.unit})`} type="number" inputMode="decimal" value={form.bodyweight} onChange={(e) => set('bodyweight', e.target.value)} placeholder={form.unit === 'kg' ? '80' : '176'} required />
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Your Lifts ({form.unit})</p>
        <Input label={`Squat (${form.unit})`} type="number" inputMode="decimal" value={form.squat} onChange={(e) => set('squat', e.target.value)} placeholder={form.unit === 'kg' ? '120' : '265'} />
        <Input label={`Bench Press (${form.unit})`} type="number" inputMode="decimal" value={form.bench} onChange={(e) => set('bench', e.target.value)} placeholder={form.unit === 'kg' ? '90' : '200'} />
        <Input label={`Deadlift (${form.unit})`} type="number" inputMode="decimal" value={form.deadlift} onChange={(e) => set('deadlift', e.target.value)} placeholder={form.unit === 'kg' ? '150' : '330'} />
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-text-tertiary uppercase tracking-wide">Optional</p>
        <Input label={`Overhead Press (${form.unit})`} type="number" inputMode="decimal" value={form.ohp} onChange={(e) => set('ohp', e.target.value)} placeholder={form.unit === 'kg' ? '55' : '120'} />
        <Input label="Pull-ups (max reps)" type="number" inputMode="numeric" value={form.pullups} onChange={(e) => set('pullups', e.target.value)} placeholder="10" />
      </Card>

      <Button type="submit" fullWidth size="lg">{submitLabel}</Button>

      <p className="text-center text-[11px] text-text-tertiary">
        Estimates for motivation and comparison — not a medical or scientifically validated measurement.
      </p>
    </form>
  );
}
