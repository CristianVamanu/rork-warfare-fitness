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
// Not mirrored: age. The sweep does not vary it, and with no age given the
// real matcher applies no age exclusion and no age bonus — so on the
// combinations swept here the two agree exactly. A program tagged with
// ageBrackets is treated as reachable by everyone, which is what the real
// matcher does for a member who did not say their age.
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
/** Same rules as exerciseTier, but says WHICH one fired. */
function tierReason(name) {
  const n = String(name ?? '').toLowerCase();
  const heavy = n.match(/barbell|smith|machine|cable|leg press|lat pulldown|pec deck|hack squat|\bbb\b/);
  if (heavy) return { tier: 2, why: `matched "${heavy[0]}" — treated as gym equipment` };
  const hand = n.match(/kettlebell|dumbbell|\bdb\b|\bkb\b|band|resistance band/);
  if (hand) return { tier: 1, why: `matched "${hand[0]}" — handheld weight` };
  const bare = n.match(/bench press|deadlift|back squat|front squat|overhead press|power clean|snatch/);
  if (bare) return { tier: 2, why: `bare lift "${bare[0]}" with no implement named — assumed barbell` };
  return { tier: 0, why: 'bodyweight' };
}

/** All exercise names in a program, phases first. */
function exerciseNames(p) {
  const fromPhases = (p.phases ?? []).flatMap((ph) => ph.schedule ?? []);
  const days = fromPhases.length > 0 ? fromPhases : (p.schedule ?? []);
  return [...days.flatMap((d) => (d.exercises ?? []).map((e) => e.name)), ...(p.exercises ?? []).map((e) => e.name)];
}

function estimateEquipmentTier(p) {
  // Admin's explicit answer wins — mirrors src/lib/programs.ts.
  if (p.equipmentTier) return p.equipmentTier;
  // Same collection --why uses, so the two can never disagree about a tier.
  const max = exerciseNames(p).reduce((m, n) => Math.max(m, exerciseTier(n)), 0);
  return max === 2 ? 'full-gym' : max === 1 ? 'home' : 'minimal';
}
/** Right sex, and kit they actually own. Mirrors the two exclusions. */
function eligible(pool, sex, equipment) {
  const rank = EQUIPMENT_RANK[equipment];
  const wrongSex = (p) => !!sex && !!p.targetGender && p.targetGender !== 'anyone' && p.targetGender !== sex;
  const bySex = pool.some((p) => !wrongSex(p)) ? pool.filter((p) => !wrongSex(p)) : pool;
  // Explicit "Suitable for" list wins; otherwise the inferred tier means
  // "this much kit or more". Mirrors src/lib/programs.ts.
  const unsuitable = (p) => {
    if (!equipment) return false;
    if (p.suitableEquipment?.length) return !p.suitableEquipment.includes(equipment);
    return EQUIPMENT_RANK[estimateEquipmentTier(p)] > rank;
  };
  return bySex.some((p) => !unsuitable(p)) ? bySex.filter((p) => !unsuitable(p)) : bySex;
}

function pickBestProgram(pool, goal, experience, trainingDays, sex, equipment) {
  if (!pool.length) return null;
  const targetGoal = GOAL_TO_PROGRAM_GOAL[goal] ?? goal;
  const levelRank = { beginner: 0, intermediate: 1, advanced: 2 };
  const userEquipmentRank = equipment ? EQUIPMENT_RANK[equipment] : undefined;
  // Equipment is an EXCLUSION now, not just a penalty — see pickBestProgram
  // in src/lib/programs.ts. The penalty below still runs, but only decides
  // between programs in the fallback case where everything is over-tier.
  const candidates = eligible(pool, sex, equipment);
  const scored = candidates.map((p) => {
    let score = 0;
    const recommended = Array.isArray(p.recommendedForGoals) && p.recommendedForGoals.includes(goal);
    if (recommended) score += 14;
    if (p.goal === targetGoal) score += 10; else if (p.goal === 'general') score += 4;
    const levelGap = Math.abs((levelRank[p.level] ?? 1) - (levelRank[experience] ?? 1));
    score += levelGap === 0 ? 6 : levelGap === 1 ? 2 : 0;
    score -= 0.5 * Math.abs(p.daysPerWeek - trainingDays);
    if ((p.phases?.length ?? 0) > 1) score += 1;
    if (p.priorityPick && (p.goal === targetGoal || recommended)) score += 5;
    if (userEquipmentRank !== undefined) {
      const need = EQUIPMENT_RANK[estimateEquipmentTier(p)];
      if (need > userEquipmentRank) score -= 5 * (need - userEquipmentRank);
      else if (!p.suitableEquipment?.length && need < userEquipmentRank) score -= 1.5 * (userEquipmentRank - need);
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

const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);

// ── --why "<name fragment>": explain one program's equipment tier ─────────
// The tier is INFERRED from exercise names, so a single renamed movement can
// push a home program into the full-gym bucket and quietly put it out of
// reach of everyone it was written for. This prints the reasoning.
const whyArg = process.argv.indexOf('--why');
if (whyArg !== -1) {
  const frag = (process.argv[whyArg + 1] ?? '').toLowerCase();
  const hits = pool.filter((p) => String(p.name ?? '').toLowerCase().includes(frag));
  if (!frag || !hits.length) {
    console.log(`\nNo program matching "${process.argv[whyArg + 1] ?? ''}". Names:`);
    pool.forEach((p) => console.log('  ' + p.name));
    process.exit(1);
  }
  for (const p of hits) {
    console.log(`\n${p.name} — tier: ${estimateEquipmentTier(p)}`);
    const names = [...new Set(exerciseNames(p))];
    const rated = names.map((n) => ({ n, ...tierReason(n) }));
    const gym = rated.filter((r) => r.tier === 2);
    if (gym.length) {
      console.log(`\n  These ${gym.length} name(s) are what make it full-gym — rename them and the whole program drops a tier:`);
      gym.forEach((r) => console.log(`    ${pad(r.n, 38)} ${r.why}`));
    } else {
      console.log('\n  Nothing forces full-gym.');
    }
    const hand = rated.filter((r) => r.tier === 1);
    const body = rated.filter((r) => r.tier === 0);
    console.log(`\n  ${hand.length} handheld (home), ${body.length} bodyweight, ${names.length} exercises total.`);
    if (!gym.length && !hand.length) console.log('  Pure bodyweight — tier is minimal.');
  }
  console.log('');
  process.exit(0);
}

const GOALS = Object.keys(GOAL_TO_PROGRAM_GOAL);
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const DAYS = [3, 4, 5, 6];
const SEX = ['male', 'female'];
const EQUIP = ['full-gym', 'home', 'minimal'];

console.log(`\n${pool.length} public programs. Equipment tier as the app estimates it:`);
for (const p of pool) console.log(`  ${pad(p.name, 30)} ${pad(p.goal, 12)} ${pad(p.level, 13)} ${p.daysPerWeek}d  ${estimateEquipmentTier(p)}${p.targetGender && p.targetGender !== 'anyone' ? '  (' + p.targetGender + ')' : ''}`);

const totalCounts = {};
const goalMisses = [];
for (const eq of EQUIP) {
  const counts = {};
  for (const sex of SEX) for (const goal of GOALS) for (const level of LEVELS) for (const days of DAYS) {
    const p = pickBestProgram(pool, goal, level, days, sex, eq);
    counts[p.name] = (counts[p.name] ?? 0) + 1;
    totalCounts[p.name] = (totalCounts[p.name] ?? 0) + 1;
    if (p.goal !== GOAL_TO_PROGRAM_GOAL[goal]) goalMisses.push(`${pad(eq, 9)} ${pad(sex, 7)} ${pad(goal, 14)} ${pad(level, 13)} ${days}d -> ${p.name} (${p.goal})`);
  }
  console.log(`\n${eq}:`);
  for (const [n, c] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${pad(n, 30)} ${String(c).padStart(3)}`);
}

// ── Headroom: what could a better question set even choose between? ───────
// A question can only improve a match if two or more programs are eligible
// for that member. Where the count is 1 the answer is forced, and no number
// of extra questions changes it — that cell needs a PROGRAM, not a question.
console.log('\nEligible programs per goal x equipment (the ceiling on matching):');
console.log(`  ${pad('goal', 15)} ${EQUIP.map((e) => pad(e, 10)).join('')}`);
const gaps = [];
for (const goal of GOALS) {
  const cells = EQUIP.map((eq) => {
    const ids = new Set();
    for (const sex of SEX) for (const p of eligible(pool, sex, eq)) ids.add(p.id);
    if (ids.size <= 1) gaps.push(`${goal} / ${eq}`);
    return pad(ids.size, 10);
  });
  console.log(`  ${pad(goal, 15)} ${cells.join('')}`);
}
console.log(gaps.length
  ? `\n${gaps.length} cell(s) where the member has NO real choice — one program or none:\n  ${gaps.join('\n  ')}\n  Build a program for these before adding onboarding questions; a question cannot pick between one option.`
  : '\nEvery goal/equipment cell has at least two eligible programs.');

const never = pool.filter((p) => !totalCounts[p.name]).map((p) => p.name);
console.log(`\nNever assigned by any of the ${GOALS.length * LEVELS.length * DAYS.length * SEX.length * EQUIP.length} possible answers: ${never.length ? never.join(', ') : 'none'}`);
if (never.length) console.log('  A program in a slot identical to another (same goal, level, days) loses every tie. Retag or relabel one of them.');

console.log(`\n${goalMisses.length} answer(s) landed on a program that does not match the goal asked for${goalMisses.length ? ':' : '.'}`);
for (const m of goalMisses) console.log('  ' + m);
console.log('');
process.exit(0);
