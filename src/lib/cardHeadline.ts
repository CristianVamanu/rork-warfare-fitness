/**
 * The one fact the post-workout card leads with.
 *
 * Replaces the weight-comparison headline ("you lifted the weight of a
 * school bus"), which was dropped deliberately. That number was real —
 * weight x reps summed across every set, the standard volume-load metric —
 * but the sentence built on it implied a single 12-tonne lift, and a figure
 * the person who earned it doesn't believe is worth less than no figure.
 *
 * Everything here is something the app already knows for certain and the
 * member can verify by counting: an achievement they just unlocked, how
 * many days in a row they've trained, or their level. No derived metric, no
 * arithmetic anyone has to take on trust.
 *
 * Ordered by how rare it is, so the card leads with whatever is genuinely
 * the most notable thing about this particular session rather than the same
 * line every time.
 */

export interface CardHeadline {
  glyph: string;
  /** The big line. Short — it renders at ~27px in a narrow card. */
  headline: string;
  /** The quiet line under it. */
  sub: string;
}

export interface HeadlineInput {
  /** Titles of achievements unlocked by THIS session, in definition order. */
  newAchievementTitles: string[];
  /** Consecutive training days, after this workout. */
  streak: number;
  powerLevel: number;
  levelTitle: string;
  completedSets: number;
  durationMinutes: number;
}

export function pickCardHeadline(input: HeadlineInput): CardHeadline {
  const { newAchievementTitles, streak, powerLevel, levelTitle, completedSets, durationMinutes } = input;

  // Rarest first. An achievement unlocks once, ever — if one just did, it is
  // categorically the most interesting thing that happened here.
  if (newAchievementTitles.length > 0) {
    const extra = newAchievementTitles.length - 1;
    return {
      glyph: '🏆',
      headline: newAchievementTitles[0],
      sub: extra > 0 ? `Unlocked · +${extra} more this session` : 'Achievement unlocked',
    };
  }

  // Two days is the smallest streak that means anything — "1 day in a row"
  // is just "today", and dressing that up as a streak is the kind of empty
  // flourish this whole change exists to remove.
  if (streak >= 2) {
    return {
      glyph: '🔥',
      headline: `${streak} days in a row`,
      sub: 'Streak alive',
    };
  }

  // Nothing rare happened: state the session plainly. Still true, still
  // countable, and it never reads as a consolation prize because it is the
  // same thing the card is already about.
  return {
    glyph: '⚡',
    headline: `Level ${powerLevel}`,
    sub: `${levelTitle} · ${completedSets} sets in ${durationMinutes} min`,
  };
}
