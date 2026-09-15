/**
 * Every feature that can be gated, in one list.
 *
 * This exists because the admin panel kept two hand-written copies of it —
 * one for "does this need a paid plan at all" (MembershipConfig.lockedFeatures)
 * and one for "does THIS plan include it" (MembershipPlan.featureAccess) —
 * and the code enforcing the gates kept a third, implicit one in the string
 * literals passed to verifyFeatureAccess/PaywallGate. They drifted, in the
 * worst possible direction: 'scan-and-go', 'ai-chat' and 'ai-tip' were all
 * enforced on the server but missing from the per-plan checkboxes, so a plan
 * that restricted anything silently locked all three with no tick anywhere
 * in the admin panel that could grant them back. The top tier could pay for
 * the AI tools and still be refused by the API.
 *
 * featureAccess is an ALLOWLIST: a plan with a non-empty list gets only what
 * it names. So a missing checkbox is never a harmless omission — it is a
 * feature no plan can ever include.
 *
 * Adding a gate? Add it here and use the same id at the call site. The test
 * in gatedFeatures.test.ts reads the source tree for enforced keys and fails
 * if one is missing from this list, which is what makes that a rule rather
 * than a convention.
 */
export interface GatedFeature {
  id: string;
  /** Admin-facing name, shown on both checkbox lists. */
  label: string;
  /** One line on what the member loses when it is not included. */
  desc: string;
}

export const GATED_FEATURES: readonly GatedFeature[] = [
  { id: 'barcode', label: 'Barcode Scanner', desc: 'Nutrition lookup via product barcode' },
  { id: 'nutrition-ai', label: 'Food Analyzer', desc: 'Photo-based nutrition analysis' },
  { id: 'meal-planner', label: 'Meal Planner', desc: 'Generates a full daily meal plan' },
  { id: 'scan-and-go', label: 'Scan & Go', desc: 'Photo-based workout builder from gym equipment' },
  // One tip per day for the whole platform, generated once and cached at
  // config/dailyTip, shown on the dashboard. Cheap to include in any plan:
  // the cost does not scale with members, only with days.
  { id: 'ai-tip', label: 'Daily Tip', desc: "The day's tip at the top of the dashboard" },
  { id: 'premium-programs', label: 'Premium Training Plans', desc: 'Switching to any program other than their own assigned one' },
  { id: 'community', label: 'Community', desc: 'Channels — browsing and posting' },
  { id: 'pr-wall', label: 'PR Wall', desc: 'Personal-record posts feed' },
  { id: 'quests', label: 'Quests', desc: 'Quest tracking' },
  { id: 'achievements', label: 'Achievements', desc: 'The achievement badge wall' },
  { id: 'habits', label: 'Habit Breaker', desc: 'Quit-habit tracking with streaks' },
  { id: 'pt-test', label: 'PT Tests', desc: 'Official entry-standard fitness tests' },
  { id: 'fasting', label: 'Fasting Timer', desc: 'Intermittent fasting tracker on the dashboard' },
  { id: 'breathing', label: 'Breathing Exercises', desc: 'Guided breathing sessions' },
] as const;

export const GATED_FEATURE_IDS: readonly string[] = GATED_FEATURES.map((f) => f.id);

/**
 * Drops feature ids that no longer exist.
 *
 * featureAccess is an allowlist, so a stale id is not inert: it keeps the
 * list non-empty, which keeps the plan RESTRICTED, while having no checkbox
 * anywhere that could clear it. Unticking every visible box then left the
 * plan restricted to nothing but dead keys, locking the whole app for
 * everyone on it — which is exactly what happened to plans holding
 * 'leaderboard' (never a real key) and 'ai-chat' (deleted with its route).
 *
 * Applied when a plan is loaded into the editor and again on save, so a plan
 * cleans itself the first time it is touched.
 */
export function pruneFeatureAccess(ids: readonly string[] | undefined): string[] {
  if (!ids) return [];
  return ids.filter((id) => GATED_FEATURE_IDS.includes(id));
}
