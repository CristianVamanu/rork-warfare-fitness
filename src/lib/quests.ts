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

export const QUEST_DEFS: QuestDef[] = [
  {
    id: 'become_spartan',
    title: 'Become Spartan',
    tagline: 'Prove your discipline over weeks, not days.',
    requirements: [
      { kind: 'totalWorkouts', target: 30, label: 'Complete 30 workouts' },
      { kind: 'streak', target: 21, label: 'Reach a 21-day streak' },
      { kind: 'powerLevel', target: 35, label: 'Reach Power Level 35' },
    ],
    rewardIcon: '🏛️',
    rewardTitle: 'Spartan Badge',
  },
  {
    id: 'iron_warrior',
    title: 'Iron Warrior',
    tagline: 'Move serious weight, consistently.',
    requirements: [
      { kind: 'totalWeightLifted', target: 25000, label: 'Lift 25,000kg total volume' },
      { kind: 'totalWorkouts', target: 20, label: 'Complete 20 workouts' },
      { kind: 'powerLevel', target: 20, label: 'Reach Power Level 20' },
    ],
    rewardIcon: '👑',
    rewardTitle: 'Iron Crown',
  },
  {
    id: 'unstoppable',
    title: 'Unstoppable',
    tagline: 'The long game. Not for the faint-hearted.',
    requirements: [
      { kind: 'streak', target: 45, label: 'Reach a 45-day streak' },
      { kind: 'totalWorkouts', target: 75, label: 'Complete 75 workouts' },
      { kind: 'powerLevel', target: 65, label: 'Reach Power Level 65' },
    ],
    rewardIcon: '🔥',
    rewardTitle: 'Phoenix Badge',
  },
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
    id: 'total_warrior',
    title: 'Total Warrior',
    tagline: 'Fuel matches effort. Master both.',
    requirements: [
      { kind: 'totalWorkouts', target: 25, label: 'Complete 25 workouts' },
      { kind: 'totalMealsLogged', target: 60, label: 'Log 60 meals' },
      { kind: 'powerLevel', target: 30, label: 'Reach Power Level 30' },
    ],
    rewardIcon: '⚡',
    rewardTitle: 'Total Warrior Badge',
  },
  {
    id: 'titan',
    title: 'Titan',
    tagline: 'The absolute pinnacle. Very few reach this.',
    requirements: [
      { kind: 'totalWeightLifted', target: 100000, label: 'Lift 100,000kg total volume' },
      { kind: 'totalWorkouts', target: 150, label: 'Complete 150 workouts' },
      { kind: 'powerLevel', target: 120, label: 'Reach Power Level 120' },
    ],
    rewardIcon: '🌋',
    rewardTitle: 'Titan Badge',
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
