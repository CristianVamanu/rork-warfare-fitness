/** Client-safe WHOOP display helpers — kept separate from lib/whoop.ts since that file pulls in server-only Firestore Admin types. */

/** WHOOP's own recovery banding: green = ready to push, yellow = moderate, red = prioritize rest. */
export function recoveryColorClass(score: number): string {
  if (score >= 67) return 'text-success';
  if (score >= 34) return 'text-amber-400';
  return 'text-danger';
}

export function recoveryLabel(score: number): string {
  if (score >= 67) return 'Optimal';
  if (score >= 34) return 'Adequate';
  return 'Low';
}
