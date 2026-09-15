/**
 * The app-wide daily AI call ceiling — constant and resolver only.
 *
 * Lives apart from usageLimit.ts on purpose: that module imports
 * firebase-admin, and the admin panel (a client component) needs this
 * number to show the effective ceiling. Importing it from usageLimit.ts
 * dragged the Admin SDK into the browser bundle and broke the build on
 * `net`. Nothing in here touches Node or Firebase, so both sides can use it.
 *
 * ALWAYS on. Unset or 0 falls back to the default rather than meaning "no
 * ceiling". A cost circuit breaker that ships switched off is not a circuit
 * breaker — it was 0 on this deployment for its entire life, so the per-user
 * caps were the only thing between a bug or an abuse spike and the OpenAI
 * bill. An admin who genuinely wants no ceiling can set a very large number;
 * there is no longer a way to set none by accident.
 */

/**
 * 20,000 calls a day. At 5,000 users that is four each, every day, before
 * anything pauses — far above real usage (the per-user caps are 10–30 and
 * most people use none). At gpt-4o-mini prices it bounds a runaway day to
 * low double-digit dollars instead of an open-ended bill.
 */
export const DEFAULT_ORG_DAILY_LIMIT = 20_000;

/** The configured ceiling, or the default when unset, 0, or not a number. */
export function resolveOrgDailyLimit(configured: unknown): number {
  const n = Number(configured);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ORG_DAILY_LIMIT;
}
