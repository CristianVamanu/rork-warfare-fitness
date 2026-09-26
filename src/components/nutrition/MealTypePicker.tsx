'use client';

import { MEAL_TYPES, type MealType } from '@/lib/mealTypes';

/**
 * Which meal slot a food is being logged into.
 *
 * Extracted from the analyze and barcode screens, which carried identical
 * copies of this markup. The meal planner had no copy at all — it logged
 * whatever slot the AI had labelled the recipe with, so a curry suggested as
 * "lunch" went into lunch even when it was logged at nine in the evening, with
 * nothing on screen offering to change it.
 */
export function MealTypePicker({
  value,
  onChange,
  label = 'Add to meal:',
  className = '',
}: {
  value: MealType;
  onChange: (t: MealType) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-text-secondary mb-2">{label}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {MEAL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-pressed={value === t}
            className={`py-1.5 text-xs rounded-lg font-medium capitalize transition-all ${
              value === t ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
