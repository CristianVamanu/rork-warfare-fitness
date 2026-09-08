#!/usr/bin/env node
/**
 * What is actually suppressing built-in programs, and put them back.
 *
 *   node --env-file=.env.production scripts/programs-state.mjs
 *       → prints every built-in and why it is or is not showing. Writes nothing.
 *
 *   node --env-file=.env.production scripts/programs-state.mjs --restore-all
 *       → clears the suppression lists so every built-in is live again.
 *         Nothing is created or destroyed; the programs were always in the
 *         app bundle, these lists just hid them.
 *
 * After a restore, delete the ones you do not want from Admin → Programs.
 * That Delete is permanent and is the only thing that should be removing
 * programs from now on.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run this from /root/rork-warfare-fitness with:');
  console.error('  node --env-file=.env.production scripts/programs-state.mjs');
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();
const restore = process.argv.includes('--restore-all');

const src = readFileSync(new URL('../src/lib/programs.ts', import.meta.url), 'utf8');
const seeds = [...src.matchAll(/^ {4}id: '([^']+)',\n {4}name: '([^']+)'/gm)].map((m) => ({ id: m[1], name: m[2] }));

const read = async (id) => new Set(((await db.collection('config').doc(id).get()).data()?.ids) ?? []);
const [deleted, purged, hidden] = await Promise.all([read('deletedMocks'), read('purgedMocks'), read('hiddenMocks')]);
const live = new Set((await db.collection('programs').get()).docs.map((d) => d.id));

if (restore) {
  await db.collection('config').doc('deletedMocks').set({ ids: [] }, { merge: true });
  await db.collection('config').doc('purgedMocks').set({ ids: [] }, { merge: true });
  await db.collection('config').doc('hiddenMocks').set({ ids: [] }, { merge: true });
  console.log(`\nRestored. ${deleted.size} deleted + ${purged.size} purged + ${hidden.size} hidden ids cleared.`);
  console.log('Every built-in program is live again. Hard-refresh the admin panel.\n');
  process.exit(0);
}

console.log(`\n${seeds.length} built-in programs in the app:\n`);
let showing = 0;
for (const s of seeds) {
  const why = [];
  if (deleted.has(s.id)) why.push('deleted');
  if (purged.has(s.id)) why.push('purged');
  if (hidden.has(s.id)) why.push('hidden');
  if (live.has(s.id)) why.push('overridden by a database program');
  if (!why.length) showing++;
  console.log(`  ${why.length ? '✗' : '✓'} ${s.id.padEnd(4)} ${s.name.padEnd(46)} ${why.join(', ') || 'showing'}`);
}
console.log(`\n${showing} showing, ${seeds.length - showing} suppressed.`);
console.log('To bring them all back:  node --env-file=.env.production scripts/programs-state.mjs --restore-all\n');
