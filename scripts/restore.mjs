#!/usr/bin/env node
/**
 * Restore a backup produced by /api/admin/backup (format version 2).
 *
 * THIS IS THE MOST DANGEROUS SCRIPT IN THE REPO. It writes documents into a
 * live Firestore project, overwriting anything at the same path. It is
 * therefore DRY RUN BY DEFAULT and needs two independent confirmations of the
 * target project before it writes a single document.
 *
 *   # See what a backup contains — writes nothing
 *   node scripts/restore.mjs --file backup.jsonl.gz --project warfare-scratch
 *
 *   # Actually write
 *   node scripts/restore.mjs --file backup.jsonl.gz --project warfare-scratch \
 *     --write --yes-really-write-to warfare-scratch
 *
 *   # Firestore only, or accounts only
 *   ... --only firestore
 *   ... --only auth --hash-params hash-params.json
 *
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS (a service-account
 * JSON path), NOT from the app's .env — restoring into the wrong project
 * because an env var was already set is exactly the accident this avoids.
 *
 * See RESTORE.md for the full procedure.
 */

import { createReadStream } from 'fs';
import { readFile } from 'fs/promises';
import { createGunzip } from 'zlib';
import readline from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') === false ? arr[i + 1] : true]);
    return acc;
  }, []),
);

const file = args.file;
const projectId = args.project;
const write = args.write === true;
const only = args.only ?? 'all';
const confirm = args['yes-really-write-to'];

if (!file || !projectId) {
  console.error('Usage: --file <backup.jsonl.gz> --project <projectId> [--write --yes-really-write-to <projectId>] [--only firestore|auth|all] [--hash-params <file>]');
  process.exit(1);
}
if (write && confirm !== projectId) {
  console.error(`REFUSED: --write requires --yes-really-write-to ${projectId} (got: ${confirm ?? 'nothing'})`);
  console.error('Both flags naming the same project is the only way to write. This is deliberate.');
  process.exit(1);
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS must point at a service-account JSON for the TARGET project.');
  process.exit(1);
}
const cred = JSON.parse(await readFile(credPath, 'utf8'));
if (cred.project_id !== projectId) {
  console.error(`REFUSED: credentials are for "${cred.project_id}" but --project says "${projectId}".`);
  process.exit(1);
}

const app = initializeApp({ credential: cert(cred), projectId });
const db = getFirestore(app);

/**
 * JSON.stringify turns a Firestore Timestamp into {_seconds,_nanoseconds}.
 * Writing that back produces a plain map where a date used to be — every
 * createdAt, expiresAt and lastWorkoutDate silently becomes an object that
 * no query or comparison understands. Rebuild them.
 */
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if (typeof v._seconds === 'number' && typeof v._nanoseconds === 'number') {
      return new Timestamp(v._seconds, v._nanoseconds);
    }
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = revive(val);
    return out;
  }
  return v;
}

const counts = {};
const authRecords = [];
let batch = write ? db.batch() : null;
let pending = 0;
let written = 0;

async function flush() {
  if (!write || pending === 0) return;
  await batch.commit();
  written += pending;
  batch = db.batch();
  pending = 0;
}

async function set(path, data) {
  counts[path.split('/')[0]] = (counts[path.split('/')[0]] ?? 0) + 1;
  if (!write) return;
  batch.set(db.doc(path), revive(data), { merge: false });
  if (++pending >= 400) await flush();
}

const rl = readline.createInterface({
  input: createReadStream(file).pipe(createGunzip()),
  crlfDelay: Infinity,
});

let manifest = null;
for await (const line of rl) {
  if (!line.trim()) continue;
  const { c, id, d } = JSON.parse(line);

  if (c === '__meta') { manifest = d; continue; }

  if (c === '__authUsers') {
    if (only === 'firestore') continue;
    authRecords.push({ uid: id, ...d });
    counts.__authUsers = (counts.__authUsers ?? 0) + 1;
    continue;
  }

  if (only === 'auth') continue;

  // Subcollections were nested onto their parent at backup time.
  if (c === 'channels') {
    const { posts = [], ...channel } = d;
    await set(`channels/${id}`, channel);
    for (const { id: pid, replies = [], ...post } of posts) {
      await set(`channels/${id}/posts/${pid}`, post);
      for (const { id: rid, ...reply } of replies) await set(`channels/${id}/posts/${pid}/replies/${rid}`, reply);
    }
  } else if (c === 'conversations' || c === 'supportTickets') {
    const { messages = [], ...parent } = d;
    await set(`${c}/${id}`, parent);
    for (const { id: mid, ...msg } of messages) await set(`${c}/${id}/messages/${mid}`, msg);
  } else if (c === 'pushSubscriptions') {
    const { userId, ...device } = d;
    if (userId) await set(`pushSubscriptions/${userId}/devices/${id}`, device);
  } else {
    await set(`${c}/${id}`, d);
  }
}
await flush();

// ── Auth accounts ──────────────────────────────────────────────────────────
// importUsers needs the project's password hash parameters. They are NOT in
// the backup on purpose (storing the lock and the key together defeats the
// point) — export them once from Firebase console → Authentication → Users →
// ⋮ → Password hash parameters.
if (only !== 'firestore' && authRecords.length) {
  const hp = args['hash-params'] ? JSON.parse(await readFile(args['hash-params'], 'utf8')) : null;
  const withPasswords = authRecords.filter((u) => u.passwordHash);

  if (!hp && withPasswords.length) {
    console.warn(`\n!! ${withPasswords.length} account(s) have password hashes but no --hash-params was given.`);
    console.warn('   Importing without them leaves those members unable to sign in with their password.');
    if (write) { console.error('   REFUSED. Re-run with --hash-params, or --only firestore.'); process.exit(1); }
  }

  if (write) {
    const users = authRecords.map((u) => ({
      uid: u.uid,
      email: u.email ?? undefined,
      emailVerified: !!u.emailVerified,
      displayName: u.displayName ?? undefined,
      photoURL: u.photoURL ?? undefined,
      disabled: !!u.disabled,
      customClaims: u.customClaims ?? undefined,
      passwordHash: u.passwordHash ? Buffer.from(u.passwordHash, 'base64') : undefined,
      passwordSalt: u.passwordSalt ? Buffer.from(u.passwordSalt, 'base64') : undefined,
      providerData: (u.providerData ?? []).filter((p) => p.providerId !== 'password'),
    }));
    for (let i = 0; i < users.length; i += 1000) {
      const res = await getAuth(app).importUsers(users.slice(i, i + 1000), {
        hash: {
          algorithm: hp.algorithm,
          key: Buffer.from(hp.base64_signer_key, 'base64'),
          saltSeparator: Buffer.from(hp.base64_salt_separator, 'base64'),
          rounds: Number(hp.rounds),
          memoryCost: Number(hp.mem_cost),
        },
      });
      if (res.failureCount) {
        console.error(`  ${res.failureCount} account(s) failed to import:`);
        for (const e of res.errors.slice(0, 5)) console.error(`    #${e.index}: ${e.error.message}`);
      }
    }
  }
}

console.log(`\n${write ? 'RESTORED' : 'DRY RUN — nothing was written'} → project ${projectId}`);
if (manifest) console.log(`backup format v${manifest.version}, taken ${manifest.createdAt}`);
console.log('\nDocuments by collection:');
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(7)}  ${k}`);
console.log(`\n  total: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
if (write) console.log(`  firestore documents written: ${written}`);
else console.log('\nRe-run with --write --yes-really-write-to ' + projectId + ' to apply.');
