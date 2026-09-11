#!/usr/bin/env node
/**
 * Who does the onboarding quiz send where — measured on the LIVE catalogue.
 *
 *   node --env-file=.env.production scripts/routing-sim.mjs
 *
 * Runs every possible quiz answer (5 goals x 3 levels x 4 day-counts x 2
 * sexes x 3 equipment answers = 360) through the same scoring the app uses
 * and prints, per equipment answer, how many land on each program, which
 * programs are never assigned, and every answer whose program does not match
 * the goal asked for.
 *
 * Read-only. Change nothing here to "fix" a result — a program that is never
 * assigned is a catalogue fact (retag it in Admin → Programs, or relabel its
 * level with program-quality.mjs --set-level), not a scoring bug.
 *
 * The scoring below mirrors pickBestProgram / estimateEquipmentTier in
 * src/lib/programs.ts. If those change, change this.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run this from /root/rork-warfare-fitness with:');
  console.error('  node --env-file=.env.production scripts/routing-sim.mjs');
  process.exit(1);
}
initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// ── Mirror of src/lib/programs.ts ──────────────────────────────────────────
const GOAL_TO_PROGRAM_GOAL = { 'military-prep': 'endurance', 'lose-fat': 'weight-loss', 'build-muscle': 'hypertrophy', recomposition: 'hypertrophy', strength: 'strength' };
const EQUIPMENT_RANK = { minimal: 0, home: 1, 'full-gym': 2 };
function exerciseTier(name) {
  const n = String(name ?? '').toLowerCase();
  const handheld = /kettlebell|dumbbell|\bdb\b|\bkb\b|band|resistance band/.test(n);
  if (/barbell|smith|machine|cable|leg press|lat pulldown|pec deck|hack squat|\bbb\b/.test(n)) return 2;
  if (handheld) return 1;
  if (/bench press|deadlift|back squat|front squat|overhead press|power clean|snatch/.test(n)) return 2;
  return 0;
}
function estimateEquipmentTier(p) {
  const fromPhases = (p.phases ?? []).flatMap((ph) => ph.schedule ?? []);
  const days = fromPhases.length > 0 ? fromPhases : (p.schedule ?? []);
  const names = [...days.flatMap((d) => (d.exercises ?? []).map((e) => e.name)), ...(p.exercises ?? []).map((e) => e.name)];
  const max = names.reduce((m, n) => Math.max(m, exerciseTier(n)), 0);
  return max === 2 ? 'full-gym' : max === 1 ? 'home' : 'minimal';
}
function pickBestProgram(pool, goal, experience, trainingDays, sex, hasLimitations, equipment) {
  if (!pool.length) return null;
  const targetGoal = GOAL_TO_PROGRAM_GOAL[goal] ?? goal;
  const levelRank = { beginner: 0, intermediate: 1, advanced: 2 };
  const userEquipmentRank = equipment ? EQUIPMENT_RANK[equipment] : undefined;
  const wrongSex = (p) => !!sex && !!p.targetGender && p.targetGender !== 'anyone' && p.targetGender !== sex;
  const candidates = pool.some((p) => !wrongSex(p)) ? pool.filter((p) => !wrongSex(p)) : pool;
  const scored = candidates.map((p) => {
    let score = 0;
    if (p.goal === targetGoal) score += 10; else if (p.goal === 'general') score += 4;
    const levelGap = Math.abs((levelRank[p.level] ?? 1) - (levelRank[experience] ?? 1));
    score += levelGap === 0 ? 6 : levelGap === 1 ? 2 : 0;
    score -= 0.5 * Math.abs(p.daysPerWeek - trainingDays);
    if ((p.phases?.length ?? 0) > 1) score += 1;
    if (hasLimitations) score -= p.level === 'advanced' ? 4 : p.level === 'intermediate' ? 1 : 0;
    if (userEquipmentRank !== undefined) {
      const need = EQUIPMENT_RANK[estimateEquipmentTier(p)];
      if (need > userEquipmentRank) score -= 5 * (need - userEquipmentRank);
    }
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].p;
}

// ── Live catalogue ─────────────────────────────────────────────────────────
const snap = await db.collection('programs').where('isPublic', '==', true).get();
const pool = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
if (!pool.length) { console.log('\nNo public programs in Firestore.\n'); process.exit(0); }

const GOALS = Object.keys(GOAL_TO_PROGRAM_GOAL);
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const DAYS = [3, 4, 5, 6];
const SEX = ['male', 'female'];
const EQUIP = ['full-gym', 'home', 'minimal'];
const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);

console.log(`\n${pool.length} public programs. Equipment tier as the app estimates it:`);
for (const p of pool) console.log(`  ${pad(p.name, 30)} ${pad(p.goal, 12)} ${pad(p.level, 13)} ${p.daysPerWeek}d  ${estimateEquipmentTier(p)}${p.targetGender && p.targetGender !== 'anyone' ? '  (' + p.targetGender + ')' : ''}`);

const totalCounts = {};
const goalMisses = [];
for (const eq of EQUIP) {
  const counts = {};
  for (const sex of SEX) for (const goal of GOALS) for (const level of LEVELS) for (const days of DAYS) {
    const p = pickBestProgram(pool, goal, level, days, sex, false, eq);
    counts[p.name] = (counts[p.name] ?? 0) + 1;
    totalCounts[p.name] = (totalCounts[p.name] ?? 0) + 1;
    if (p.goal !== GOAL_TO_PROGRAM_GOAL[goal]) goalMisses.push(`${pad(eq, 9)} ${pad(sex, 7)} ${pad(goal, 14)} ${pad(level, 13)} ${days}d -> ${p.name} (${p.goal})`);
  }
  console.log(`\n${eq}:`);
  for (const [n, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${pad(n, 30)} ${String(c).padStart(3)}`);
}

const never = pool.filter((p) => !totalCounts[p.name]).map((p) => p.name);
console.log(`\nNever assigned by any of the ${GOALS.length * LEVELS.length * DAYS.length * SEX.length * EQUIP.length} possible answers: ${never.length ? never.join(', ') : 'none'}`);
if (never.length) console.log('  A program in a slot identical to another (same goal, level, days) loses every tie. Retag or relabel one of them.');

console.log(`\n${goalMisses.length} answer(s) landed on a program that does not match the goal asked for${goalMisses.length ? ':' : '.'}`);
for (const m of goalMisses) console.log('  ' + m);
console.log('');
process.exit(0);
