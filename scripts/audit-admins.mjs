#!/usr/bin/env node
/**
 * Who has admin on this deployment, and does each one look legitimate.
 *
 *   node --env-file=.env.production scripts/audit-admins.mjs
 *       → read-only. Cross-references every role:'admin' user document
 *         against its Firebase Auth record and flags anything odd.
 *
 *   node --env-file=.env.production scripts/audit-admins.mjs --demote <uid>
 *       → sets that one account's role to 'user'. Reversible (promote again
 *         in Admin → Clients). Does NOT delete the account or its data.
 *
 * WHY THIS EXISTS
 * The browser installer used to require firestore.rules to let an
 * unauthenticated caller create a user document with role:'admin' while
 * `system/installer.installed` was not exactly true — and that flag was only
 * written as the very last step, so any interruption left the grant open.
 * See the comment at the top of src/app/api/install/route.ts: that hole was
 * found live on this deployment. It is closed now, but an account created
 * through it would still be sitting in the database with full admin rights,
 * and admin bypasses every security rule in the app.
 *
 * An admin document with no matching Auth user, no email, or a creation time
 * that does not line up with a login you remember making is worth a hard look.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run this from /root/rork-warfare-fitness with:');
  console.error('  node --env-file=.env.production scripts/audit-admins.mjs');
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();
const auth = getAuth();

const demoteIndex = process.argv.indexOf('--demote');
const demoteUid = demoteIndex !== -1 ? process.argv[demoteIndex + 1] : null;

if (demoteUid) {
  const ref = db.collection('users').doc(demoteUid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`No user document with id ${demoteUid}.`);
    process.exit(1);
  }
  if (snap.data()?.role !== 'admin') {
    console.error(`${demoteUid} is not an admin (role: ${snap.data()?.role ?? 'none'}). Nothing to do.`);
    process.exit(1);
  }
  await ref.update({ role: 'user' });
  console.log(`\n  Demoted ${demoteUid} (${snap.data()?.email ?? 'no email'}) to role 'user'.`);
  console.log(`  Their data is untouched and you can promote them again from Admin -> Clients.`);
  console.log(`  To stop them signing in at all, disable the account in the Firebase console.\n`);
  process.exit(0);
}

const snap = await db.collection('users').where('role', '==', 'admin').get();
console.log(`\n${snap.size} account${snap.size === 1 ? '' : 's'} with role 'admin'.`);
console.log(`Each one bypasses every firestore.rules check in the app.\n`);

const seenEmails = new Map();
const findings = [];

for (const doc of snap.docs) {
  const u = doc.data();
  console.log('─'.repeat(78));
  console.log(`  uid          ${doc.id}`);
  console.log(`  doc email    ${u.email ?? '(none)'}`);
  console.log(`  doc name     ${u.displayName ?? '(none)'}`);
  console.log(`  doc created  ${u.createdAt?.toDate?.()?.toISOString?.() ?? u.createdAt ?? '(none)'}`);

  let authUser = null;
  try {
    authUser = await auth.getUser(doc.id);
  } catch {
    console.log(`  auth record  *** NONE — no Firebase Auth user with this uid ***`);
    findings.push(`${doc.id}: admin document with no Auth account behind it`);
  }

  if (authUser) {
    const p = authUser.providerData.map((x) => x.providerId).join(', ') || '(none)';
    console.log(`  auth email   ${authUser.email ?? '(none)'}${authUser.emailVerified ? ' (verified)' : authUser.email ? ' (UNVERIFIED)' : ''}`);
    console.log(`  auth created ${authUser.metadata.creationTime}`);
    console.log(`  last sign-in ${authUser.metadata.lastSignInTime ?? '(never)'}`);
    console.log(`  providers    ${p}`);
    console.log(`  disabled     ${authUser.disabled}`);

    if (!authUser.email) findings.push(`${doc.id}: admin with no email address on its Auth record`);
    if (authUser.email && !authUser.emailVerified) findings.push(`${doc.id} (${authUser.email}): admin whose email was never verified`);
    if (!authUser.metadata.lastSignInTime) findings.push(`${doc.id}: admin that has never signed in`);

    const key = (authUser.email ?? '').toLowerCase();
    if (key) {
      if (seenEmails.has(key)) findings.push(`${key}: TWO admin accounts share this email (${seenEmails.get(key)} and ${doc.id})`);
      else seenEmails.set(key, doc.id);
    }
  }
}

console.log('─'.repeat(78));

if (findings.length === 0) {
  console.log('\nNothing anomalous. Every admin has a verified email and a sign-in history.\n');
} else {
  console.log(`\n${findings.length} thing${findings.length === 1 ? '' : 's'} worth a look:\n`);
  for (const f of findings) console.log(`  - ${f}`);
  console.log(`\nIf you do not recognise one, demote it first (reversible, keeps the data):`);
  console.log(`  node --env-file=.env.production scripts/audit-admins.mjs --demote <uid>`);
  console.log(`\nAdmin is all-or-nothing here: it bypasses firestore.rules entirely, so an`);
  console.log(`account you cannot account for can read and change every user's data.\n`);
}

process.exit(0);
