/**
 * The four meal slots, and how to guess which one the user means right now.
 *
 * The type was declared separately in analyze/page.tsx, barcode/page.tsx and
 * meal-planner/page.tsx, and nutrition/page.tsx kept its own MEAL_TYPES array
 * for grouping the day's log. Four declarations of the same four strings, which
 * is how the meal planner ended up being the one screen that never asked.
 */

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Display and iteration order — matches how the nutrition page groups a day. */
export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/**
 * The slot a meal logged *now* most likely belongs to, from the user's own
 * clock.
 *
 * Every screen that logs a meal previously hardcoded a default — 'lunch' on
 * the analyze page, 'snack' on the barcode page, and on the meal planner
 * whatever the AI happened to label the recipe, which is how an evening meal
 * got filed under breakfast because the model decided an omelette is a
 * breakfast food. None of those are better than simply reading the time.
 *
 * Boundaries are deliberately generous rather than clever: this is a default
 * the user can change in one tap, so being roughly right beats being
 * precisely opinionated. Late night resolves to snack rather than breakfast —
 * food at 1am is far more often a snack than the next morning's first meal.
 */
export function defaultMealTypeForNow(now: Date = new Date()): MealType {
  const hour = now.getHours();
  if (hour < 5) return 'snack';
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}
