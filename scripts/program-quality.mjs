#!/usr/bin/env node
/**
 * Grades the LIVE programs on the things that decide whether a member gets
 * coached or just gets a list.
 *
 *   node --env-file=.env.production scripts/program-quality.mjs
 *       → read-only report on every program in Firestore.
 *
 *   node --env-file=.env.production scripts/program-quality.mjs --set-level <id> <level>
 *       → changes one program's difficulty label. Nothing else is touched.
 *
 * WHY A SCRIPT. The seed file in the repo is not what members train on — once
 * a program has been imported or created in the admin panel, Firestore is the
 * source of truth, and the app serves that. Auditing the repo copy would grade
 * a program nobody is running.
 *
 * WHAT IT GRADES, and why each one matters to a real person:
 *
 *  - CUES. Every exercise can carry a short "how to perform" note, which the
 *    app shows behind the info button during the set. Without it a beginner
 *    gets a name and a rep count — "Pistol Squat, 3x5" — and no idea what
 *    good looks like. This is the difference between an app and a coach, and
 *    it is the most common thing missing.
 *  - RPE. How hard the set should feel. The admin builder collects it and the
 *    program document stores it; a program generated before that was wired up
 *    may have none, in which case the member trains with no intensity target.
 *  - REST DAYS vs LEVEL. Six training days with one rest day is a reasonable
 *    ask of an advanced athlete and a good way to break a beginner. The label
 *    is what the onboarding recommender routes on, so a mislabelled program
 *    does not just mislead — it gets actively assigned to the wrong people.
 *  - PHASES. A twelve-week program with no phases is week one repeated twelve
 *    times. Not unsafe, just not worth twelve weeks of anyone's subscription.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run this from /root/rork-warfare-fitness with:');
  console.error('  node --env-file=.env.production scripts/program-quality.mjs');
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const setLevelAt = process.argv.indexOf('--set-level');
if (setLevelAt !== -1) {
  const id = process.argv[setLevelAt + 1];
  const level = process.argv[setLevelAt + 2];
  if (!id || !['beginner', 'intermediate', 'advanced'].includes(level)) {
    console.error('Usage: --set-level <programId> <beginner|intermediate|advanced>');
    process.exit(1);
  }
  const ref = db.collection('programs').doc(id);
  const snap = await ref.get();
  if (!snap.exists) { console.error(`No program with id ${id}.`); process.exit(1); }
  const before = snap.data()?.level;
  await ref.update({ level });
  console.log(`\n  ${snap.data()?.name}: level ${before} -> ${level}`);
  console.log(`  Onboarding routes on this field, so the change takes effect on the next signup.`);
  console.log(`  Public pages cache for an hour — hit Admin -> Programs and edit anything to purge, or wait.\n`);
  process.exit(0);
}

const snap = await db.collection('programs').get();
if (snap.empty) {
  console.log('\nNo programs in Firestore — the app is still serving the built-in seed library.\n');
  process.exit(0);
}

const rows = [];
for (const doc of snap.docs) {
  const p = { id: doc.id, ...doc.data() };
  const phases = p.phases?.length ? p.phases : [{ label: '(single block)', schedule: p.schedule ?? [] }];
  const allEx = phases.flatMap((ph) => (ph.schedule ?? []).flatMap((d) => d.exercises ?? []));
  const withCue = allEx.filter((e) => e.notes && String(e.notes).trim()).length;
  const withRpe = allEx.filter((e) => typeof e.rpe === 'number' && e.rpe > 0).length;
  const week = phases[0].schedule ?? [];
  const restDays = week.filter((d) => d.isRest).length;

  rows.push({
    id: p.id,
    name: p.name ?? '(unnamed)',
    goal: p.goal ?? '?',
    sex: p.targetGender ?? 'anyone',
    level: p.level ?? '?',
    exNames: new Set(allEx.map((e) => String(e.name).toLowerCase().replace(/[^a-z ]/g, '').trim()).filter(Boolean)),
    weeks: p.weeks ?? 0,
    days: p.daysPerWeek ?? 0,
    restDays,
    phases: p.phases?.length ?? 0,
    total: allEx.length,
    cuePct: allEx.length ? Math.round((100 * withCue) / allEx.length) : 0,
    rpePct: allEx.length ? Math.round((100 * withRpe) / allEx.length) : 0,
    isPublic: p.isPublic !== false,
  });
}

rows.sort((a, b) => a.cuePct - b.cuePct);

const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
console.log(`\n${rows.length} program${rows.length === 1 ? '' : 's'} in Firestore.\n`);
console.log(pad('PROGRAM', 30), pad('GOAL', 12), pad('SEX', 7), pad('LEVEL', 13), pad('WKS', 4), pad('D/WK', 5), pad('REST', 5), pad('PHASES', 7), pad('CUES', 6), pad('RPE', 6), 'PUBLIC');
console.log('-'.repeat(122));
for (const r of rows) {
  console.log(
    pad(r.name, 30), pad(r.goal, 12), pad(r.sex, 7), pad(r.level, 13), pad(r.weeks, 4), pad(r.days, 5),
    pad(r.restDays, 5), pad(r.phases || '—', 7),
    pad(`${r.cuePct}%`, 6), pad(`${r.rpePct}%`, 6), r.isPublic ? 'yes' : 'no',
  );
}

// ── What the catalogue covers, measured ────────────────────────────────────
// The onboarding recommender routes on goal, level, days and equipment. This
// is the grid of what exists, so "what's missing" is read off the data rather
// than guessed.
console.log('\nCoverage — programs per goal x level:');
const goals = [...new Set(rows.map((r) => r.goal))].sort();
const levels = ['beginner', 'intermediate', 'advanced'];
console.log('  ' + pad('', 14) + levels.map((l) => pad(l, 14)).join(''));
for (const g of goals) {
  console.log('  ' + pad(g, 14) + levels.map((l) => pad(rows.filter((r) => r.goal === g && r.level === l).map((r) => r.days + 'd').join(',') || '—', 14)).join(''));
}
console.log('  (cells show days/week of each program in that slot)');
console.log('  targetGender set on: ' + (rows.filter((r) => r.sex !== 'anyone').map((r) => r.name + ' (' + r.sex + ')').join(', ') || 'none — the Male/Female answer changes nothing'));

// Exercise-set overlap: how alike two programs are by what they actually prescribe.
const pairs = [];
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
  const a = rows[i].exNames, b = rows[j].exNames;
  if (a.size === 0 || b.size === 0) continue;
  const inter = [...a].filter((x) => b.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  pairs.push({ pct: Math.round((100 * inter) / uni), a: rows[i].name, b: rows[j].name });
}
pairs.sort((x, y) => y.pct - x.pct);
console.log('\nMost similar pairs by shared exercises (Jaccard):');
for (const pr of pairs.slice(0, 8)) console.log(`  ${String(pr.pct).padStart(3)}%  ${pad(pr.a, 30)} ~ ${pr.b}`);

const findings = [];
for (const r of rows) {
  if (r.cuePct < 60) findings.push(`${r.name}: only ${r.cuePct}% of its ${r.total} exercises carry a form cue — a beginner gets a name and a rep count and nothing else.`);
  if (r.rpePct < 50) findings.push(`${r.name}: only ${r.rpePct}% carry an RPE, so most sets have no intensity target.`);
  if (r.level === 'beginner' && r.restDays <= 1) findings.push(`${r.name}: labelled BEGINNER with ${r.restDays} rest day a week. Onboarding routes beginners here.`);
  if (r.weeks >= 8 && r.phases === 0) findings.push(`${r.name}: ${r.weeks} weeks with no phases — week 12 is identical to week 1.`);
}

console.log(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}:\n`);
for (const f of findings) console.log('  - ' + f);
console.log(`\nIDs, for --set-level:`);
for (const r of rows) console.log(`  ${pad(r.id, 26)} ${r.name}`);
console.log('');
process.exit(0);
