#!/usr/bin/env node
/**
 * Which built-in (seed) programs are safe to delete from src/lib/programs.ts?
 *
 * Read-only. Writes nothing, changes nothing.
 *
 * Deleting a seed from the source is the only thing that actually removes it
 * from the shipped JavaScript — config can suppress a program, it cannot
 * un-compile it. But three things can still depend on a seed after an admin
 * has "deleted" it, and each one breaks silently:
 *
 *  1. A member still enrolled in it. resolveProgram() would return null and
 *     their Training screen loses its active program.
 *  2. A member with saved progress against it — their history stops
 *     resolving to a name.
 *  3. THE SUBTLE ONE: a Firestore program document sharing the seed's id but
 *     carrying no schedule of its own. resolveProgram() merges the two and
 *     falls back to the seed's schedule:
 *         schedule: fsDoc?.schedule?.length ? fsDoc.schedule : mock?.schedule
 *     So a program that looks like a normal database program in the admin
 *     panel may in fact be getting all of its workouts from the seed. Delete
 *     the seed and it becomes a program with no workouts in it — and nothing
 *     anywhere reports an error.
 *
 * Usage, from the app directory on the server:
 *
 *   node --env-file=.env.production scripts/check-seed-removal.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.');
  console.error('Run with: node --env-file=.env.production scripts/check-seed-removal.mjs');
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// Parse the seed ids/names straight out of the source, so this can never
// disagree with the file it is advising you about.
const src = readFileSync(new URL('../src/lib/programs.ts', import.meta.url), 'utf8');
const seeds = [...src.matchAll(/^ {4}id: '([^']+)',\n {4}name: '([^']+)'/gm)]
  .map((m) => ({ id: m[1], name: m[2] }));

const arr = async (docId) =>
  new Set(((await db.collection('config').doc(docId).get()).data()?.ids) ?? []);

const [deleted, purged, hidden] = await Promise.all([
  arr('deletedMocks'), arr('purgedMocks'), arr('hiddenMocks'),
]);

const [usersSnap, progressSnap, programsSnap] = await Promise.all([
  db.collection('users').get(),
  db.collection('programProgress').get().catch(() => ({ docs: [] })),
  db.collection('programs').get(),
]);

const enrolled = new Map();
for (const d of usersSnap.docs) {
  const pid = d.data()?.activeProgram?.programId;
  if (pid) enrolled.set(pid, (enrolled.get(pid) ?? 0) + 1);
}
const withProgress = new Map();
for (const d of progressSnap.docs) {
  const pid = d.data()?.programId ?? d.id.split('_').pop();
  if (pid) withProgress.set(pid, (withProgress.get(pid) ?? 0) + 1);
}
const fsPrograms = new Map(programsSnap.docs.map((d) => [d.id, d.data()]));

const candidates = seeds.filter((s) => deleted.has(s.id));
const safe = [];
const unsafe = [];

for (const s of candidates) {
  const reasons = [];
  const users = enrolled.get(s.id) ?? 0;
  const prog = withProgress.get(s.id) ?? 0;
  const fs = fsPrograms.get(s.id);

  if (users) reasons.push(`${users} member(s) currently enrolled`);
  if (prog) reasons.push(`${prog} saved progress record(s)`);
  if (fs && !(Array.isArray(fs.schedule) && fs.schedule.length)) {
    reasons.push('a Firestore program shares this id and has NO schedule of its own — it is using the seed\'s workouts');
  }
  (reasons.length ? unsafe : safe).push({ ...s, reasons });
}

const line = '─'.repeat(72);
console.log(`\n${line}\nSeed programs in the code: ${seeds.length}`);
console.log(`Marked deleted by an admin:  ${candidates.length}`);
console.log(`Also purged from the panel:  ${[...purged].length}`);
console.log(`Hidden (not deleted):        ${[...hidden].length}\n${line}\n`);

console.log(`SAFE TO REMOVE FROM SOURCE (${safe.length}):`);
if (!safe.length) console.log('  (none)');
for (const s of safe) console.log(`  ${s.id.padEnd(5)} ${s.name}`);

console.log(`\nNOT SAFE — would break something (${unsafe.length}):`);
if (!unsafe.length) console.log('  (none)');
for (const s of unsafe) {
  console.log(`  ${s.id.padEnd(5)} ${s.name}`);
  for (const r of s.reasons) console.log(`        ↳ ${r}`);
}

const keep = seeds.filter((s) => !deleted.has(s.id));
console.log(`\nSTAYING (live, not deleted) (${keep.length}):`);
for (const s of keep) console.log(`  ${s.id.padEnd(5)} ${s.name}`);

console.log(`\n${line}`);
console.log('Copy this whole output back to Claude. Nothing was changed.');
console.log(`${line}\n`);
process.exit(0);
