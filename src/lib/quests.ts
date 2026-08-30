import { doc, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

export type QuestRequirementKind = 'totalWorkouts' | 'streak' | 'powerLevel' | 'totalWeightLifted' | 'totalMealsLogged';

export interface QuestRequirement {
  kind: QuestRequirementKind;
  target: number;
  label: string; // e.g. "Complete 20 workouts"
}

export interface QuestDef {
  id: string;
  title: string;      // e.g. "Become Spartan"
  tagline: string;
  requirements: QuestRequirement[];
  rewardIcon: string;
  rewardTitle: string; // e.g. "Legendary Badge"
}

// Thresholds intentionally form a steep ladder, not a flat one — first_blood
// is left as an easy, fast first win (an onboarding hook, not a real test),
// but every tier after that jumps by a wide margin. The old thresholds let
// a genuinely dedicated user clear every quest in the list within a couple
// months and then hit a dead end with nothing left to chase — titan and the
// two new endgame tiers below now require 6+ months of real consistency,
// and immortal/warlord exist specifically so "I finished all the quests"
// stops being a real end state.
export const QUEST_DEFS: QuestDef[] = [
  {
    id: 'first_blood',
    title: 'First Blood',
    tagline: 'Everyone starts somewhere. This is where you begin.',
    requirements: [
      { kind: 'totalWorkouts', target: 5, label: 'Complete 5 workouts' },
      { kind: 'streak', target: 3, label: 'Reach a 3-day streak' },
    ],
    rewardIcon: '🗡️',
    rewardTitle: 'First Blood Badge',
  },
  {
    id: 'iron_warrior',
    title: 'Iron Warrior',
    tagline: 'Move serious weight, consistently.',
    requirements: [
      { kind: 'totalWeightLifted', target: 40000, label: 'Lift 40,000kg total volume' },
      { kind: 'totalWorkouts', target: 30, label: 'Complete 30 workouts' },
      { kind: 'powerLevel', target: 25, label: 'Reach Power Level 25' },
    ],
    rewardIcon: '👑',
    rewardTitle: 'Iron Crown',
  },
  {
    id: 'total_warrior',
    title: 'Total Warrior',
    tagline: 'Fuel matches effort. Master both.',
    requirements: [
      { kind: 'totalWorkouts', target: 40, label: 'Complete 40 workouts' },
      { kind: 'totalMealsLogged', target: 100, label: 'Log 100 meals' },
      { kind: 'powerLevel', target: 40, label: 'Reach Power Level 40' },
    ],
    rewardIcon: '⚡',
    rewardTitle: 'Total Warrior Badge',
  },
  {
    id: 'become_spartan',
    title: 'Become Spartan',
    tagline: 'Prove your discipline over weeks, not days.',
    requirements: [
      { kind: 'totalWorkouts', target: 50, label: 'Complete 50 workouts' },
      { kind: 'streak', target: 30, label: 'Reach a 30-day streak' },
      { kind: 'powerLevel', target: 50, label: 'Reach Power Level 50' },
    ],
    rewardIcon: '🏛️',
    rewardTitle: 'Spartan Badge',
  },
  {
    id: 'unstoppable',
    title: 'Unstoppable',
    tagline: 'The long game. Not for the faint-hearted.',
    requirements: [
      { kind: 'streak', target: 60, label: 'Reach a 60-day streak' },
      { kind: 'totalWorkouts', target: 120, label: 'Complete 120 workouts' },
      { kind: 'powerLevel', target: 90, label: 'Reach Power Level 90' },
    ],
    rewardIcon: '🔥',
    rewardTitle: 'Phoenix Badge',
  },
  {
    id: 'titan',
    title: 'Titan',
    tagline: 'The absolute pinnacle. Very few reach this.',
    requirements: [
      { kind: 'totalWeightLifted', target: 180000, label: 'Lift 180,000kg total volume' },
      { kind: 'totalWorkouts', target: 220, label: 'Complete 220 workouts' },
      { kind: 'powerLevel', target: 160, label: 'Reach Power Level 160' },
    ],
    rewardIcon: '🌋',
    rewardTitle: 'Titan Badge',
  },
  // ── Endgame tier — for users who clear everything above and want a
  // reason to keep going. Deliberately no ceiling on this list; add
  // another tier above warlord if these two ever stop feeling out of reach.
  {
    id: 'immortal',
    title: 'Immortal',
    tagline: 'A streak this long stops being a habit. It becomes who you are.',
    requirements: [
      { kind: 'streak', target: 100, label: 'Reach a 100-day streak' },
      { kind: 'totalWorkouts', target: 300, label: 'Complete 300 workouts' },
      { kind: 'powerLevel', target: 220, label: 'Reach Power Level 220' },
    ],
    rewardIcon: '⚔️',
    rewardTitle: 'Immortal Badge',
  },
  {
    id: 'warlord',
    title: 'Warlord',
    tagline: 'The final tier. Almost no one gets here.',
    requirements: [
      { kind: 'totalWeightLifted', target: 300000, label: 'Lift 300,000kg total volume' },
      { kind: 'totalWorkouts', target: 400, label: 'Complete 400 workouts' },
      { kind: 'powerLevel', target: 300, label: 'Reach Power Level 300' },
    ],
    rewardIcon: '☠️',
    rewardTitle: 'Warlord Badge',
  },
];

export interface QuestProgressInput {
  totalWorkouts: number;
  streak: number;
  powerLevel: number;
  totalWeightLifted: number;
  totalMealsLogged?: number;
}

export function requirementProgress(req: QuestRequirement, stats: QuestProgressInput): number {
  const current = stats[req.kind] ?? 0;
  return Math.min(1, current / req.target);
}

export function isQuestComplete(quest: QuestDef, stats: QuestProgressInput): boolean {
  return quest.requirements.every((r) => (stats[r.kind] ?? 0) >= r.target);
}

/** Check all quests, award newly-completed ones, return their IDs. */
export async function checkAndAwardQuests(userId: string, stats: QuestProgressInput): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const existing: string[] = (snap.data()?.questsCompleted as string[]) ?? [];

    const newlyCompleted = QUEST_DEFS
      .map((q) => q.id)
      .filter((id) => !existing.includes(id) && isQuestComplete(QUEST_DEFS.find((q) => q.id === id)!, stats));

    if (newlyCompleted.length > 0) {
      // arrayUnion applies atomically against the document's actual current
      // state at write time — writing back `[...existing, ...newlyCompleted]`
      // from this snapshot read could otherwise lose a quest another
      // concurrent call (e.g. an unawaited check from logging a meal
      // firing around the same time as a workout completion) already added
      // between this read and this write.
      await setDoc(
        doc(db, 'users', userId),
        { questsCompleted: arrayUnion(...newlyCompleted) },
        { merge: true }
      );
      await setDoc(
        doc(db, 'leaderboardPublic', userId),
        { questsCompleted: arrayUnion(...newlyCompleted) },
        { merge: true }
      ).catch((err) => console.error('[Quests] leaderboardPublic sync failed:', err));
    }
    return newlyCompleted;
  } catch (err) {
    console.error('[Quests] check failed:', err);
    return [];
  }
}
