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
  // These two gate API routes that NO SCREEN IN THE APP CALLS. Both were
  // built, left unwired, and found unauthenticated during the billing audit
  // — an open OpenAI tap for anyone with the URL — so they were locked down
  // rather than deleted. Nothing a member can tap reaches either one today,
  // so ticking or unticking them changes nothing a member would notice.
  // Neither has anything to do with 1:1 messaging between a real coach and
  // a client: that is the Messages screen and the separate coaching tier.
  // They stay listed because the routes still enforce these exact keys, and
  // a gate that is enforced but unlistable is the bug this registry exists
  // to prevent. Delete the routes and these two entries go with them.
  { id: 'ai-chat', label: 'Chat Assistant (no screen yet)', desc: 'Automated training/nutrition chat — endpoint only, unreachable in the app' },
  { id: 'ai-tip', label: 'Daily Tip (no screen yet)', desc: 'One generated tip per day, shared by all members — endpoint only, shown nowhere' },
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
