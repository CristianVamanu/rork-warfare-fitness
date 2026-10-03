#!/usr/bin/env node
/**
 * Mark existing members as having already seen the welcome video.
 *
 * The video fires for anyone with access and no `welcomeVideoSeenAt`. Every
 * member who joined before the field existed matches that, so without this
 * they would all be greeted with a "welcome to the team" video on their next
 * visit — months into their membership.
 *
 * Run ONCE, right after deploying the feature and before you set a video URL.
 *
 *   node --env-file=.env.production scripts/backfill-welcome-video.mjs          # dry run
 *   node --env-file=.env.production scripts/backfill-welcome-video.mjs --write
 *
 * Only touches users who do not already have the field, so it is safe to run
 * again and can never overwrite someone's real seen-timestamp.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run from /root/rork-warfare-fitness with:');
  console.error('  node --env-file=.env.production scripts/backfill-welcome-video.mjs');
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();
const write = process.argv.includes('--write');

const snap = await db.collection('users').get();
const targets = snap.docs.filter((d) => d.data().welcomeVideoSeenAt === undefined);

console.log(`\n${snap.size} users, ${targets.length} without welcomeVideoSeenAt.`);

if (!write) {
  console.log('\nDry run — nothing written. These would be marked as already seen:');
  for (const d of targets.slice(0, 25)) console.log(`  ${d.id}  ${d.data().email ?? ''}`);
  if (targets.length > 25) console.log(`  ...and ${targets.length - 25} more`);
  console.log('\nRe-run with --write to apply.\n');
  process.exit(0);
}

let done = 0;
for (let i = 0; i < targets.length; i += 400) {
  const batch = db.batch();
  for (const d of targets.slice(i, i + 400)) {
    batch.update(d.ref, { welcomeVideoSeenAt: FieldValue.serverTimestamp() });
    done++;
  }
  await batch.commit();
}
console.log(`\nMarked ${done} existing user(s) as already welcomed.`);
console.log('New members from here on will see the video once, after they get access.\n');
