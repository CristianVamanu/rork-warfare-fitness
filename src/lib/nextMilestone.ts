import { QUEST_DEFS, requirementProgress, type QuestProgressInput } from './quests';
import { ACHIEVEMENT_DEFS, achievementProgress, achievementRemaining } from './achievements';
import { xpToNextLevel } from './xp';

/**
 * Picks the single closest-to-earned milestone for the dashboard strip.
 *
 * Deliberately returns ONE thing, not a list. Five half-finished progress
 * bars become wallpaper within a week — people stop seeing them. One thing
 * that's nearly done is a reason to train today, which is the only reason
 * this belongs on the dashboard at all.
 */

// Below this, a milestone discourages rather than motivates — "4% of the way
// to 300 workouts" tells someone how far they AREN'T. Anything less complete
// loses to the power-level fallback, which by construction is never more than
// 100 XP away.
export const NEAR_ENOUGH = 0.6;

export interface Milestone {
  icon: string;
  title: string;
  detail: string;
  /** 0-1. */
  progress: number;
  /** Remaining units of the underlying stat; breaks ties at equal progress. */
  remaining: number;
  href: string;
  kind: 'quest' | 'achievement' | 'level';
}

export interface MilestoneInput extends QuestProgressInput {
  xp: number;
  earnedAchievements: string[];
  completedQuests: string[];
}

function formatNum(n: number): string {
  return n >= 1000 ? n.toLocaleString() : String(n);
}

/** Every in-progress milestone, unfiltered and unsorted. Exported for tests. */
export function milestoneCandidates(input: MilestoneInput): Milestone[] {
  const out: Milestone[] = [];
  const completedQuests = new Set(input.completedQuests);
  const earned = new Set(input.earnedAchievements);

  for (const quest of QUEST_DEFS) {
    if (completedQuests.has(quest.id)) continue;
    // A quest completes only when EVERY requirement is met, so its true
    // progress is its worst requirement — which is also the one worth naming,
    // since it's what actually stands between them and the badge.
    let worst: { target: number; label: string; kind: keyof QuestProgressInput; pct: number } | null = null;
    for (const req of quest.requirements) {
      const pct = requirementProgress(req, input);
      if (!worst || pct < worst.pct) worst = { target: req.target, label: req.label, kind: req.kind, pct };
    }
    if (!worst || worst.pct >= 1 || worst.pct <= 0) continue;
    const current = (input[worst.kind] as number | undefined) ?? 0;
    out.push({
      icon: quest.rewardIcon,
      title: quest.title,
      detail: `${formatNum(current)} / ${formatNum(worst.target)} — ${worst.label.replace(/^(Complete|Reach|Lift)\s+/i, '')}`,
      progress: worst.pct,
      remaining: worst.target - current,
      href: '/quests',
      kind: 'quest',
    });
  }

  for (const def of ACHIEVEMENT_DEFS) {
    if (earned.has(def.id)) continue;
    const pct = achievementProgress(def.id, input);
    // null = a boolean achievement (Early Bird, Weekend Warrior). There's no
    // "how close am I" for those, so they can never be the next milestone.
    if (pct === null || pct >= 1 || pct <= 0) continue;
    out.push({
      icon: def.icon,
      title: def.title,
      detail: def.desc,
      progress: pct,
      remaining: achievementRemaining(def.id, input) ?? 0,
      href: '/achievements',
      kind: 'achievement',
    });
  }

  return out;
}

/**
 * The one milestone to show. Never null: power level moves on every workout
 * and is never more than 100 XP away, so a brand-new account with nothing
 * else in progress still gets something live rather than an empty strip.
 */
export function pickNextMilestone(input: MilestoneInput): Milestone {
  const best = milestoneCandidates(input)
    .filter((c) => c.progress >= NEAR_ENOUGH)
    .sort((a, b) => (b.progress - a.progress) || (a.remaining - b.remaining))[0];
  if (best) return best;

  const { current, needed } = xpToNextLevel(input.xp);
  return {
    icon: '⚡',
    title: `Power Level ${input.powerLevel + 1}`,
    detail: `${current} / ${needed} XP`,
    progress: current / needed,
    remaining: needed - current,
    href: '/progress',
    kind: 'level',
  };
}
