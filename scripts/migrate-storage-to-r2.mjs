#!/usr/bin/env node
/**
 * Moves every file still hosted on Firebase Storage into Cloudflare R2, and
 * repoints the database at the new copies.
 *
 *   node --env-file=.env.production scripts/migrate-storage-to-r2.mjs
 *       → DRY RUN. Finds everything, downloads nothing, writes nothing.
 *         Prints exactly what a real run would do.
 *
 *   node --env-file=.env.production scripts/migrate-storage-to-r2.mjs --apply
 *       → Copies the files and rewrites the URLs.
 *
 *   ... --apply --limit 3      copy only the first 3 files (a safe first run)
 *   ... --apply --concurrency 2  fewer parallel transfers on a small box
 *
 * WHAT IT DOES NOT DO: it never deletes anything from Firebase Storage. The
 * originals stay exactly where they are, so if a copy turns out to be wrong
 * the old URL is still live and re-running fixes it. Deleting is a separate,
 * later decision made once the badges in the admin panel read zero and the
 * app has been used for a while.
 *
 * WHY THIS EXISTS. Everything uploaded before R2 support landed (late July
 * 2026) went to Firebase Storage. Those files cost per GB of egress every
 * time a member watches a clip, and they stop serving entirely the moment
 * that Google project's billing account lapses — which is exactly what took
 * the demo videos down. R2 charges no egress and is not coupled to that
 * billing account.
 *
 * SAFE TO RE-RUN. Each pass re-reads the database, so anything already moved
 * is simply not found again. If it dies halfway, run it again.
 *
 * ORDER OF OPERATIONS, per file: download from Firebase → upload to R2 →
 * fetch the new public URL back and check it is really readable → only then
 * rewrite the database. A file that fails any step keeps its old URL; the
 * database is never pointed at something unproven.
 */

import { createHash, createDecipheriv } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// ── Arguments ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const numArg = (name, fallback) => {
  const i = argv.indexOf(name);
  const v = i === -1 ? NaN : Number(argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const limit = numArg('--limit', Infinity);
const concurrency = numArg('--concurrency', 4);

// ── Firebase ───────────────────────────────────────────────────────────────
const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Run this from /root/rork-warfare-fitness with:');
  console.error('  node --env-file=.env.production scripts/migrate-storage-to-r2.mjs');
  process.exit(1);
}
initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore();

// ── Secrets ────────────────────────────────────────────────────────────────
// The app keeps third-party keys encrypted in Firestore at system/secrets,
// falling back to the env var of the same name. This mirrors that, so the
// script works whichever way R2 was configured — env vars on this box, or
// entered through the admin panel.
function decrypt(payload) {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is not set — needed to read secrets saved from the admin panel');
  const key = createHash('sha256').update(raw).digest();
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  d.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(payload.ciphertext, 'base64')), d.final()]).toString('utf8');
}

let storedSecrets = null;
async function getSecret(name) {
  if (process.env[name]) return process.env[name];
  if (storedSecrets === null) {
    const snap = await db.collection('system').doc('secrets').get();
    storedSecrets = snap.exists ? (snap.data() ?? {}) : {};
  }
  const payload = storedSecrets[name];
  if (!payload?.ciphertext) return '';
  try { return decrypt(payload); } catch { return ''; }
}

// ── Where a URL lives (mirrors src/lib/storageHost.ts) ─────────────────────
function storageHostOf(url) {
  if (!url || typeof url !== 'string' || !url.trim()) return 'none';
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'other'; }
  if (host === 'firebasestorage.googleapis.com' || host.endsWith('.firebasestorage.app')) return 'firebase';
  if (host === 'storage.googleapis.com') return 'firebase';
  if (host.endsWith('.r2.dev') || host.endsWith('.r2.cloudflarestorage.com')) return 'r2';
  return 'other';
}

/** The object's path inside the bucket, recovered from a Firebase download URL. */
function keyFromFirebaseUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/o\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);           // /v0/b/<bucket>/o/<encoded key>
    return decodeURIComponent(u.pathname.replace(/^\/+/, '').split('/').slice(1).join('/')); // raw GCS
  } catch { return ''; }
}

// ── Collect every Firebase-hosted URL, and how to rewrite it ───────────────
// A single URL is usually referenced many times (one library entry plus every
// program that snapshotted it), so files are copied once and every reference
// is repointed.
const refs = [];   // { docPath, describe, get, set } — set() mutates an in-memory doc
const docs = new Map(); // docPath -> { ref, data, dirty }

function trackDoc(ref, data) {
  if (!docs.has(ref.path)) docs.set(ref.path, { ref, data, dirty: false });
  return docs.get(ref.path);
}

function consider(entry, obj, field, describe) {
  const url = obj?.[field];
  if (storageHostOf(url) !== 'firebase') return;
  refs.push({
    url,
    describe,
    docPath: entry.ref.path,
    apply: (newUrl) => { obj[field] = newUrl; entry.dirty = true; },
  });
}

console.log('\nScanning Firestore for files still on Firebase Storage…');

const libSnap = await db.collection('exerciseLibrary').get();
for (const doc of libSnap.docs) {
  const entry = trackDoc(doc.ref, doc.data());
  consider(entry, entry.data, 'videoUrl', `library: ${entry.data.name ?? doc.id} (video)`);
  consider(entry, entry.data, 'thumbnailUrl', `library: ${entry.data.name ?? doc.id} (thumbnail)`);
}

const progSnap = await db.collection('programs').get();
for (const doc of progSnap.docs) {
  const entry = trackDoc(doc.ref, doc.data());
  const p = entry.data;
  const label = p.name ?? doc.id;
  consider(entry, p, 'imageUrl', `program: ${label} (cover image)`);
  const eachExercise = (list, where) => (list ?? []).forEach((ex) => {
    consider(entry, ex, 'videoUrl', `program: ${label} / ${ex.name} ${where}`);
    consider(entry, ex, 'thumbnailUrl', `program: ${label} / ${ex.name} thumb ${where}`);
  });
  (p.phases ?? []).forEach((ph, pi) => (ph.schedule ?? []).forEach((d, di) => eachExercise(d.exercises, `(phase ${pi + 1} day ${di + 1})`)));
  (p.schedule ?? []).forEach((d, di) => eachExercise(d.exercises, `(day ${di + 1})`));
  eachExercise(p.exercises, '(flat list)');
}

if (refs.length === 0) {
  console.log('\nNothing to migrate — no Firebase Storage URLs found. \n');
  process.exit(0);
}

// One entry per distinct file; many references can share it.
const byUrl = new Map();
for (const r of refs) {
  if (!byUrl.has(r.url)) byUrl.set(r.url, []);
  byUrl.get(r.url).push(r);
}
const files = [...byUrl.keys()].slice(0, limit === Infinity ? undefined : limit);

console.log(`\n${byUrl.size} distinct file(s) on Firebase Storage, referenced ${refs.length} time(s) across ${docs.size} document(s).`);
if (files.length < byUrl.size) console.log(`--limit ${limit}: only the first ${files.length} will be processed.`);

if (!apply) {
  console.log('\nDRY RUN — nothing will be downloaded, uploaded or written.\n');
  for (const url of files) {
    console.log(`  ${keyFromFirebaseUrl(url) || url}`);
    for (const r of byUrl.get(url)) console.log(`      ← ${r.describe}`);
  }
  console.log(`\nRe-run with --apply to migrate. Originals are never deleted.\n`);
  process.exit(0);
}

// ── R2 ─────────────────────────────────────────────────────────────────────
const [accountId, accessKeyId, secretAccessKey, bucket, publicBase] = await Promise.all([
  getSecret('R2_ACCOUNT_ID'), getSecret('R2_ACCESS_KEY_ID'), getSecret('R2_SECRET_ACCESS_KEY'),
  getSecret('R2_BUCKET_NAME'), getSecret('R2_PUBLIC_URL'),
]);
const missing = Object.entries({ R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_BUCKET_NAME: bucket, R2_PUBLIC_URL: publicBase })
  .filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`\nCannot reach R2 — missing: ${missing.join(', ')}`);
  console.error('Set them in .env.production, or in Admin → Integrations (needs ENCRYPTION_KEY here to read those).\n');
  process.exit(1);
}
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});
const publicUrlFor = (key) => `${publicBase.replace(/\/$/, '')}/${key}`;

// ── Migrate ────────────────────────────────────────────────────────────────
async function migrateOne(url) {
  const key = keyFromFirebaseUrl(url);
  if (!key) return { url, ok: false, why: 'could not work out the object path from the URL' };

  // Already there from an interrupted run? Then just repoint at it.
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const existing = publicUrlFor(key);
    const probe = await fetch(existing, { method: 'HEAD' }).catch(() => null);
    if (probe?.ok) return { url, ok: true, newUrl: existing, why: 'already in R2 from an earlier run' };
  } catch { /* not there yet — normal path below */ }

  const res = await fetch(url).catch((e) => ({ ok: false, status: 0, statusText: String(e?.message ?? e) }));
  if (!res.ok) {
    const hint = res.status === 402
      ? 'Firebase billing is still disabled — the file cannot be read yet, so it cannot be moved. Re-run once it is reinstated.'
      : `Firebase answered ${res.status} ${res.statusText ?? ''}`.trim();
    return { url, ok: false, why: hint };
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length === 0) return { url, ok: false, why: 'downloaded 0 bytes' };
  const contentType = res.headers.get('content-type') || 'application/octet-stream';

  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));

  // Writing to the bucket and the bucket being publicly readable are two
  // different permissions in R2. Confirm the new URL actually serves before
  // pointing the database at it, or the fix becomes the bug.
  const newUrl = publicUrlFor(key);
  const verify = await fetch(newUrl, { method: 'GET', headers: { Range: 'bytes=0-0' } }).catch(() => null);
  if (!verify || !(verify.status === 200 || verify.status === 206)) {
    return { url, ok: false, why: `uploaded to R2 but the public URL answered ${verify ? verify.status : 'nothing'} — check the bucket's Public Development URL / custom domain` };
  }
  return { url, ok: true, newUrl, bytes: body.length };
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < files.length) {
    const url = files[cursor++];
    const n = cursor;
    const r = await migrateOne(url).catch((e) => ({ url, ok: false, why: String(e?.message ?? e) }));
    results.push(r);
    const size = r.bytes ? ` ${(r.bytes / 1048576).toFixed(1)}MB` : '';
    console.log(`  [${n}/${files.length}] ${r.ok ? 'ok  ' : 'FAIL'} ${keyFromFirebaseUrl(url)}${size}${r.why ? ` — ${r.why}` : ''}`);
  }
}
console.log(`\nCopying ${files.length} file(s) to R2 (${concurrency} at a time)…\n`);
await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));

// ── Rewrite the database ───────────────────────────────────────────────────
let repointed = 0;
for (const r of results) {
  if (!r.ok) continue;
  for (const ref of byUrl.get(r.url)) { ref.apply(r.newUrl); repointed++; }
}

const dirty = [...docs.values()].filter((d) => d.dirty);
if (dirty.length) {
  console.log(`\nRepointing ${repointed} reference(s) across ${dirty.length} document(s)…`);
  // Batched, because a program document is large and one write per reference
  // would rewrite the same document dozens of times.
  for (let i = 0; i < dirty.length; i += 400) {
    const batch = db.batch();
    for (const d of dirty.slice(i, i + 400)) batch.set(d.ref, d.data);
    await batch.commit();
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.filter((r) => r.ok).length} file(s) migrated, ${failed.length} failed, ${repointed} reference(s) repointed.`);
if (failed.length) {
  console.log('\nStill on Firebase (their URLs were left untouched, so nothing broke):');
  for (const f of failed) console.log(`  ${keyFromFirebaseUrl(f.url) || f.url}\n      ${f.why}`);
  console.log('\nFix the cause and re-run — this script skips whatever is already done.');
}
console.log(`
Next:
  node --env-file=.env.production scripts/video-check.mjs     # every clip re-probed
  Admin → Library                                             # the Firebase badge count should be down

Nothing was deleted from Firebase Storage. Once the app has been used for a
while and the badges read zero, the originals can be removed there.
`);
process.exit(failed.length ? 1 : 0);
