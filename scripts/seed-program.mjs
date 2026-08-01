// Seeds (or updates) a single program directly into the live Firestore
// `programs` collection, using the same Firebase Admin credentials the app
// itself already runs on (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY) — no separate setup needed.
//
// This exists specifically instead of hardcoding new programs into
// src/lib/programs.ts: a hardcoded "seed"/mock program never appears in
// Admin → Programs, so it can never be marked premium, priced, edited, or
// deleted from the admin panel — it's dead weight the admin has no control
// over. Writing straight into Firestore (same shape a program created
// through the Admin → Programs → Builder UI would have) makes it a real,
// fully-manageable program from the moment it exists.
//
// Usage (run on the server that already has the app's env vars — the VPS,
// not this dev machine, unless you have a local .env with the same keys):
//   node --env-file=.env scripts/seed-program.mjs scripts/programs/alpha-bulk.json
//
// Safe to re-run: it upserts by the program's own `id` field (merge:true),
// so running it again with an edited JSON file updates the same program
// instead of creating a duplicate.

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node --env-file=.env scripts/seed-program.mjs <path-to-program.json>');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.');
  console.error('Run this with --env-file=.env pointed at the same .env the app itself uses.');
  process.exit(1);
}

const program = JSON.parse(readFileSync(filePath, 'utf8'));
if (!program.id) {
  console.error('Program JSON must have an "id" field.');
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

const { id, ...data } = program;
const ref = db.collection('programs').doc(id);
const existing = await ref.get();
await ref.set(
  {
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  },
  { merge: true }
);

console.log(`✓ Seeded program "${program.name}" (id: ${id}) into Firestore.`);
console.log('  It will now appear in Admin → Programs, fully editable — premium toggle, price, everything.');
