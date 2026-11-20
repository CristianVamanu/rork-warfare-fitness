/**
 * 1-to-1 coaching programs.
 *
 * A program built for one client is marked `visibility: 'coaching'` in the
 * program builder. It must only ever reach a member because a trainer or
 * admin assigned it to them. It is never matched by the quiz, never listed
 * for browsing, never sold, never a suggested "next program", and a member
 * cannot enrol themselves in one (firestore.rules: coachingEnrollAllowed).
 *
 * `isPublic` is NOT the test. A published coaching program used to be saved
 * with isPublic: true, and every "public" query then picked it up; the
 * visibility flag is the one thing that says what the program is.
 */
export function isCoachingProgram(p: object | null | undefined): boolean {
  // `visibility` is written by the program builder but is not on the Program
  // type, so it is read here once rather than cast at every call site.
  return (p as { visibility?: unknown } | null | undefined)?.visibility === 'coaching';
}

/**
 * Whether this member may see or open a coaching program: only when it is
 * the one they are on, or one they were on before (a trainer put them there).
 */
export function memberHasCoachingProgram(
  profile: { activeProgram?: { programId?: string } | null; programProgress?: Record<string, unknown> | null } | null | undefined,
  programId: string,
): boolean {
  if (!profile || !programId) return false;
  return profile.activeProgram?.programId === programId || !!profile.programProgress?.[programId];
}
