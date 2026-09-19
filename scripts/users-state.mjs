#!/usr/bin/env node
/**
 * Why the Clients tab shows fewer people than the Clients tile counts.
 *
 *   node --env-file=.env.production scripts/users-state.mjs
 *
 * Writes nothing. Prints every document in `users` with the two fields that
 * decide whether it appears in the admin Clients tab, then reconciles the
 * two numbers the admin panel shows.
 *
 * The tile counts EVERY document in `users` (a getCountFromServer aggregation
 * over the whole collection). The tab lists `users.filter(u => u.role !==
 * 'admin')` out of one loaded page. So the two numbers legitimately differ
 * when there are admin accounts — and differ for a completely different
 * reason if a document fails to load. This tells you which it is.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run this from /root/rork-warfare-fitness with:');
  console.error('  node --env-file=.env.production scripts/users-state.mjs');
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const snap = await db.collection('users').get();
const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

console.log(`\nTotal documents in "users": ${docs.length}`);
console.log('(this is exactly what the Clients tile counts)\n');

const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
console.log(pad('DOC ID', 30), pad('ROLE', 10), pad('IN TAB?', 8), pad('EMAIL', 32), 'DISPLAY NAME');
console.log('-'.repeat(110));

let shown = 0;
const byRole = {};
for (const u of docs) {
  // The exact expression the admin panel uses. Note a MISSING role passes
  // this (undefined !== 'admin'), so roleless documents do appear in the tab.
  const inTab = u.role !== 'admin';
  if (inTab) shown++;
  const roleKey = u.role ?? '(no role field)';
  byRole[roleKey] = (byRole[roleKey] ?? 0) + 1;
  console.log(
    pad(u.id, 30),
    pad(roleKey, 10),
    pad(inTab ? 'yes' : 'HIDDEN', 8),
    pad(u.email, 32),
    u.displayName ?? '',
  );
}

console.log('\nBreakdown by role:');
for (const [role, n] of Object.entries(byRole).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad(role, 18)} ${n}`);
}

console.log(`\nRECONCILIATION`);
console.log(`  Clients tile shows : ${docs.length}   (every document)`);
console.log(`  Clients tab lists  : ${shown}   (role !== 'admin')`);
const diff = docs.length - shown;
if (diff === 0) {
  console.log(`\n  These agree. If the panel still disagrees, the tab did not load every`);
  console.log(`  document — check for a "Load more" control, or a failed read in the`);
  console.log(`  browser console.`);
} else {
  console.log(`\n  Difference of ${diff}: the ${diff} account${diff === 1 ? '' : 's'} marked HIDDEN above ${diff === 1 ? 'is an admin' : 'are admins'},`);
  console.log(`  which the Clients tab excludes by design. Demote one in Admin → Clients`);
  console.log(`  if it should not be an admin.`);
}
console.log('');
process.exit(0);
