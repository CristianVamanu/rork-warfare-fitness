'use client';

import { Card } from '@/components/ui/Card';
import type { MedicalHistoryAnswers } from '@/types';

/**
 * Health screening + lifestyle habit questions.
 *
 * These used to be two mandatory steps in signup onboarding, where they
 * were the single biggest source of drop-off: fifteen Yes/No medical
 * questions standing between someone and the app they just signed up for,
 * all of them required before the flow would advance. They're genuinely
 * useful information — but for 1:1 coaching, where a human trainer
 * actually reads and acts on them, not as a toll gate on first run.
 * So they live here now and are rendered by the coaching application form.
 */

function YesNoField({
  label, value, onChange, detail, onDetailChange, detailPlaceholder,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  detail?: string;
  onDetailChange?: (v: string) => void;
  detailPlaceholder?: string;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-white flex-1">{label}</p>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${value === false ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${value === true ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}
          >
            Yes
          </button>
        </div>
      </div>
      {value === true && onDetailChange && (
        <input
          value={detail ?? ''}
          onChange={(e) => onDetailChange(e.target.value)}
          placeholder={detailPlaceholder ?? 'Please specify (optional)'}
          className="w-full mt-2 bg-surface border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
      )}
    </div>
  );
}

export function HealthScreeningFields({ data, onChange }: { data: MedicalHistoryAnswers; onChange: (patch: Partial<MedicalHistoryAnswers>) => void }) {
  return (
    <div>
      <p className="text-sm font-medium text-text-secondary mb-2">Health screening</p>
      <Card className="p-4 divide-y divide-white/5">
        <YesNoField label="Do you practice sports/exercise?" value={data.practicesSports} onChange={(v) => onChange({ practicesSports: v })} detail={data.sportsDetail} onDetailChange={(v) => onChange({ sportsDetail: v })} detailPlaceholder="Which sport(s)?" />
        <YesNoField label="Movement or coordination disorders?" value={data.movementDisorders} onChange={(v) => onChange({ movementDisorders: v })} detail={data.movementDisordersDetail} onDetailChange={(v) => onChange({ movementDisordersDetail: v })} />
        <YesNoField label="Previous surgeries?" value={data.previousSurgeries} onChange={(v) => onChange({ previousSurgeries: v })} detail={data.previousSurgeriesDetail} onDetailChange={(v) => onChange({ previousSurgeriesDetail: v })} />
        <YesNoField label="Sports injuries?" value={data.sportsInjuries} onChange={(v) => onChange({ sportsInjuries: v })} detail={data.sportsInjuriesDetail} onDetailChange={(v) => onChange({ sportsInjuriesDetail: v })} />
        <YesNoField label="Other musculoskeletal problems?" value={data.musculoskeletalProblems} onChange={(v) => onChange({ musculoskeletalProblems: v })} detail={data.musculoskeletalProblemsDetail} onDetailChange={(v) => onChange({ musculoskeletalProblemsDetail: v })} />
        <YesNoField label="Heart disease?" value={data.heartDisease} onChange={(v) => onChange({ heartDisease: v })} detail={data.heartDiseaseDetail} onDetailChange={(v) => onChange({ heartDiseaseDetail: v })} />
        <YesNoField label="Other medical conditions?" value={data.otherMedicalConditions} onChange={(v) => onChange({ otherMedicalConditions: v })} detail={data.otherMedicalConditionsDetail} onDetailChange={(v) => onChange({ otherMedicalConditionsDetail: v })} />
      </Card>
    </div>
  );
}

export function LifestyleHabitsFields({ data, onChange }: { data: MedicalHistoryAnswers; onChange: (patch: Partial<MedicalHistoryAnswers>) => void }) {
  return (
    <div>
      <p className="text-sm font-medium text-text-secondary mb-2">Lifestyle habits</p>
      <Card className="p-4 divide-y divide-white/5">
        <YesNoField label="Do you smoke?" value={data.smokes} onChange={(v) => onChange({ smokes: v })} />
        <YesNoField label="Drink alcohol regularly?" value={data.drinksAlcoholRegularly} onChange={(v) => onChange({ drinksAlcoholRegularly: v })} detail={data.alcoholFrequency} onDetailChange={(v) => onChange({ alcoholFrequency: v })} detailPlaceholder="How often?" />
        <YesNoField label="Suffer from stress?" value={data.suffersFromStress} onChange={(v) => onChange({ suffersFromStress: v })} />
        <YesNoField label="Sleeping pills or sedatives?" value={data.takesSleepingPills} onChange={(v) => onChange({ takesSleepingPills: v })} />
        <YesNoField label="Pain medication?" value={data.takesPainMedication} onChange={(v) => onChange({ takesPainMedication: v })} />
        <YesNoField label="Beta blockers?" value={data.takesBetaBlockers} onChange={(v) => onChange({ takesBetaBlockers: v })} />
        <YesNoField label="Frequently eat very fatty/sweet foods?" value={data.eatsFattyOrSweetFoodsOften} onChange={(v) => onChange({ eatsFattyOrSweetFoodsOften: v })} />
        <YesNoField label="Often experience food cravings?" value={data.experiencesFoodCravings} onChange={(v) => onChange({ experiencesFoodCravings: v })} />
      </Card>
      <div className="mt-3">
        <label className="text-xs font-medium text-text-secondary mb-1.5 block">Daily fluid intake</label>
        <input
          type="text"
          value={data.dailyFluidIntake ?? ''}
          onChange={(e) => onChange({ dailyFluidIntake: e.target.value })}
          placeholder="e.g. 2 liters"
          className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
        />
      </div>
    </div>
  );
}
