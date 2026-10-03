/**
 * The lookup table firestore.rules uses to enforce what a plan unlocks.
 *
 * WHY IT EXISTS. Plans live in ONE document per kind
 * (`config/membershipPlans`, `config/coachingPlans`) holding an ARRAY, and
 * Firestore rules cannot search an array for a matching id — no loops, no
 * find. So the rules cannot answer "does this member's plan cover the
 * program library?" from the plans themselves.
 *
 * A MAP they can read directly. `config/planEntitlements` is that map,
 * rewritten automatically every time plans are saved:
 *
 *   { membership: { "<planId>": ["premium-programs", ...] },
 *     coaching:   { "<planId>": [...] } }
 *
 * WHY A DERIVED MAP AND NOT A COPY ON THE USER. Copying a member's
 * entitlements onto their user document at purchase time also works and
 * needs no extra read — but it is a SNAPSHOT. Edit a plan's features
 * afterwards and the app (which reads the live plan) and the rules (which
 * read the snapshot) disagree: the member sees a feature unlocked and the
 * write is refused, or the reverse. Fixing that needs a re-sync run by hand
 * after every plan edit, which is the kind of step nobody remembers. This
 * map is rebuilt by the same call that saves the plans, so the two can never
 * drift.
 *
 * COST. The rules only read it when a member actually SWITCHES program —
 * the `||` chain short-circuits before then on every ordinary write,
 * including logging a set, because the program id is unchanged.
 */

export type PlanKind = 'membership' | 'coaching';

export interface PlanEntitlementMap {
  membership: Record<string, string[]>;
  coaching: Record<string, string[]>;
}

/** Plans keyed by id → the tools each unlocks. `[]` means "restricts nothing". */
export function buildEntitlementIndex(
  plans: Array<{ id?: string; featureAccess?: string[] }>,
): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  for (const plan of plans) {
    if (!plan?.id) continue;
    index[plan.id] = Array.isArray(plan.featureAccess) ? plan.featureAccess : [];
  }
  return index;
}
