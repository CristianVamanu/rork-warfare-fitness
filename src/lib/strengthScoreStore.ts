/**
 * Firestore access for the Warfare Strength Score feature — kept isolated
 * from the main firestore.ts data-access layer since this is a standalone,
 * mostly-anonymous, public-facing feature with its own collection and rules
 * (see firestore.rules' strengthScoreResults match block), not part of the
 * authenticated-app data model.
 */
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { stripUndefinedDeep } from './utils';
import type { StrengthInputs, StrengthResult } from './strengthScore';

export interface StrengthScoreDoc {
  id: string;
  displayName: string | null;
  age: number;
  sex: 'male' | 'female';
  bodyweightKg: number;
  squatKg: number;
  benchKg: number;
  deadliftKg: number;
  ohpKg: number | null;
  pullupReps: number | null;
  score: number;
  classification: string;
  strongestLiftKey: string;
  weakestLiftKey: string;
  relativeStrength: number;
  isChallenge: boolean;
  challengedResultId: string | null;
  userId: string | null;
  createdAt: unknown;
}

/**
 * Saves a computed result for sharing. The score/classification are
 * computed client-side (calculateStrengthScore) and stored as-is — same
 * trust model as e.g. self-reported PR posts elsewhere in the app. This is
 * a vanity/viral feature, not a security- or payment-relevant one, so
 * Firestore rules validate ranges/shape rather than recomputing server-side.
 */
export async function saveStrengthScoreResult(
  inputs: StrengthInputs,
  result: StrengthResult,
  opts: { displayName: string | null; userId: string | null; isChallenge?: boolean; challengedResultId?: string | null }
): Promise<string> {
  const ref = await addDoc(collection(db, 'strengthScoreResults'), stripUndefinedDeep({
    displayName: opts.displayName,
    age: inputs.age,
    sex: inputs.sex,
    bodyweightKg: inputs.bodyweightKg,
    squatKg: inputs.squatKg,
    benchKg: inputs.benchKg,
    deadliftKg: inputs.deadliftKg,
    ohpKg: inputs.ohpKg ?? null,
    pullupReps: inputs.pullupReps ?? null,
    score: result.score,
    classification: result.classification,
    strongestLiftKey: result.strongestLift.key,
    weakestLiftKey: result.weakestLift.key,
    relativeStrength: result.relativeStrength,
    isChallenge: !!opts.isChallenge,
    challengedResultId: opts.challengedResultId ?? null,
    userId: opts.userId,
    createdAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function getStrengthScoreResult(id: string): Promise<StrengthScoreDoc | null> {
  const snap = await getDoc(doc(db, 'strengthScoreResults', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<StrengthScoreDoc, 'id'>) };
}
