export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Full export of Firestore + Firebase Auth to a single gzipped JSONL file,
 * uploaded to a private Cloudflare R2 bucket.
 *
 * STREAMED, not buffered. The previous version accumulated every collection
 * into one in-memory object and then JSON.stringify'd it — holding the whole
 * database in RAM twice over, on a box that is also serving requests. At 8
 * accounts that was 1MB and invisible; in the low thousands it becomes a
 * killed worker rather than a clear error, which is the worst way for a
 * backup to fail (silently, and only discovered when you need it). Documents
 * are now read in pages and written straight through gzip to a temp file, so
 * peak memory is one page regardless of how large the database gets.
 *
 * FORMAT — one JSON object per line, gzipped:
 *   {"c":"<collection>","id":"<docId>","d":{...}}
 * Self-describing, so a restore reads it line by line without loading the
 * file. The first line is a manifest:
 *   {"c":"__meta","id":"manifest","d":{version,createdAt,collections}}
 * Auth accounts appear as collection "__authUsers".
 *
 * Callable two ways:
 *   - By an admin from the browser (Admin → Settings → "Run Backup Now")
 *   - By the nightly cron, authenticated with CRON_SECRET. That job calls
 *     localhost, NOT the public domain — Cloudflare cuts origin requests off
 *     at ~100s and a full export legitimately runs longer. See deploy.sh.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import os from 'os';
import path from 'path';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getR2Client } from '@/lib/r2';
import { getSecret } from '@/lib/secrets';
import { timingSafeEqualString } from '@/lib/crypto';
import type { Firestore } from 'firebase-admin/firestore';

/** Documents read per round trip. Bounds peak memory. */
const PAGE = 500;

/** Keep this many backups in R2. Older objects are pruned after each run. */
const R2_RETENTION = 30;

const BACKUP_FORMAT_VERSION = 2;

// Top-level collections that hold real data worth backing up.
//
// `system` is included but its `secrets` document is filtered out below. The
// original exclusion was right about the secrets blob — no reason to copy
// encrypted API keys into a second location — but it also dropped
// system/config, which holds branding, the trainerId every user doc points
// at, and the AI spend caps. That is configuration you cannot reconstruct.
const COLLECTIONS = [
  'users', 'events', 'meals', 'waterLogs', 'workoutLogs', 'weightLogs', 'habitLogs',
  'programs', 'posts', 'notifications', 'coachingApplications', 'config',
  'prPosts', 'progressPhotos', 'userPreferences', 'exerciseLibrary',
  'system', 'stripeCustomers', 'goals', 'ptTestResults', 'communityActivity',
  'trainerLeads', 'landingLeads', 'orphanedSubscriptions', 'tenants', 'leaderboardPublic',
] as const;

/**
 * Deliberately NOT backed up, because restoring them would be wrong or
 * pointless: rateLimits, users/*\/usage, twoFactorCodes, emailVerifyCodes and
 * trustedDevices are short-lived security/throttling state that must expire
 * rather than come back; stripeEvents is a replay ledger only meaningful
 * against live Stripe deliveries; errorReports is diagnostics.
 */

async function authorize(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (cronSecret && authHeader && timingSafeEqualString(authHeader, `Bearer ${cronSecret}`)) return { ok: true as const };

  const check = await verifyAdmin(req);
  if ('error' in check) return { ok: false as const, error: check.error, status: check.status };
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const r2Client = await getR2Client();
  // Deliberately NOT R2_BUCKET_NAME — that bucket serves public content
  // (exercise videos, PR Wall photos), and a file containing every user's
  // data plus password hashes must never sit somewhere publicly readable.
  const backupBucket = await getSecret('R2_BACKUP_BUCKET_NAME');
  const offSite = !!(r2Client && backupBucket);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.jsonl.gz`;
  const tmpPath = path.join(os.tmpdir(), filename);

  const counts: Record<string, number> = {};
  let authUsers: number | null = null;

  try {
    const gzip = createGzip();
    const written = pipeline(gzip, createWriteStream(tmpPath));

    /** Writes one line, applying backpressure so a fast reader can't outrun gzip. */
    const write = async (c: string, id: string, d: unknown) => {
      if (!gzip.write(JSON.stringify({ c, id, d }) + '\n')) {
        await new Promise<void>((resolve) => gzip.once('drain', resolve));
      }
      counts[c] = (counts[c] ?? 0) + 1;
    };

    await write('__meta', 'manifest', {
      version: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      note: 'One JSON object per line. Auth password hashes require the project hash parameters from the Firebase console to be importable.',
    });

    /** Streams a collection in pages, calling `emit` per document. */
    const eachDoc = async (
      dbRef: Firestore,
      name: string,
      emit: (id: string, data: Record<string, unknown>, ref: FirebaseFirestore.DocumentReference) => Promise<void>,
    ) => {
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      for (;;) {
        let q = dbRef.collection(name).orderBy('__name__').limit(PAGE);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        if (snap.empty) return;
        for (const d of snap.docs) await emit(d.id, d.data(), d.ref);
        if (snap.size < PAGE) return;
        cursor = snap.docs[snap.docs.length - 1];
      }
    };

    for (const name of COLLECTIONS) {
      await eachDoc(db, name, async (id, data) => {
        // system/secrets holds encrypted third-party API keys. Configuration
        // is worth backing up; that blob is not — copying it into a second
        // store only widens where a key can leak from, and it is restorable
        // by pasting the keys back in.
        if (name === 'system' && id === 'secrets') return;
        await write(name, id, data);
      });
    }

    // Subcollections. Each parent's children are bounded by that parent, so
    // they stay nested on the parent's line rather than needing their own.
    await eachDoc(db, 'channels', async (id, data, ref) => {
      const postsSnap = await ref.collection('posts').get();
      const posts = await Promise.all(postsSnap.docs.map(async (p) => {
        const replies = await p.ref.collection('replies').get();
        return { id: p.id, ...p.data(), replies: replies.docs.map((r) => ({ id: r.id, ...r.data() })) };
      }));
      await write('channels', id, { ...data, posts });
    });

    await eachDoc(db, 'conversations', async (id, data, ref) => {
      const msgs = await ref.collection('messages').get();
      await write('conversations', id, { ...data, messages: msgs.docs.map((m) => ({ id: m.id, ...m.data() })) });
    });

    // A ticket without its messages is not a restore.
    await eachDoc(db, 'supportTickets', async (id, data, ref) => {
      const msgs = await ref.collection('messages').get();
      await write('supportTickets', id, { ...data, messages: msgs.docs.map((m) => ({ id: m.id, ...m.data() })) });
    });

    // pushSubscriptions/{uid}/devices/{deviceId} — a subcollection, so it
    // needs a collectionGroup query rather than db.collection(name).
    const devicesSnap = await db.collectionGroup('devices').get();
    for (const d of devicesSnap.docs) {
      if (d.ref.parent.parent?.parent.id !== 'pushSubscriptions') continue;
      await write('pushSubscriptions', d.id, { userId: d.ref.parent.parent?.id, ...d.data() });
    }

    // ── Firebase Auth accounts ────────────────────────────────────────────
    //
    // The `users` COLLECTION holds profile data. It does not hold the
    // ACCOUNT: email, password hash, MFA enrolment. Restoring Firestore alone
    // gives you a database full of profiles nobody can log into.
    //
    // Written ONLY to the private off-site bucket — password hashes must not
    // land on the app server's own disk, which is where the fallback below
    // writes. If R2 isn't configured they are skipped and the reason logged,
    // rather than quietly downgrading the security of the most sensitive
    // data in the app.
    if (offSite) {
      const adminAuth = getAuth(app);
      let pageToken: string | undefined;
      authUsers = 0;
      do {
        const page = await adminAuth.listUsers(1000, pageToken);
        for (const u of page.users) {
          await write('__authUsers', u.uid, {
            email: u.email ?? null,
            emailVerified: u.emailVerified,
            displayName: u.displayName ?? null,
            photoURL: u.photoURL ?? null,
            disabled: u.disabled,
            passwordHash: u.passwordHash ?? null,
            passwordSalt: u.passwordSalt ?? null,
            customClaims: u.customClaims ?? null,
            providerData: u.providerData.map((p) => ({ providerId: p.providerId, uid: p.uid, email: p.email ?? null })),
            multiFactorEnrolled: (u.multiFactor?.enrolledFactors ?? []).length,
            createdAt: u.metadata.creationTime,
            lastSignInAt: u.metadata.lastSignInTime,
          });
        }
        authUsers += page.users.length;
        pageToken = page.pageToken;
      } while (pageToken);
      console.log(`[admin/backup] included ${authUsers} Firebase Auth account(s)`);
    } else {
      console.error(
        '[admin/backup] Firebase Auth accounts NOT backed up — they go only to the private off-site ' +
        'bucket and R2_BACKUP_BUCKET_NAME is unset. Without them a restore produces profiles nobody ' +
        'can log into. Set it in Admin → Integrations.'
      );
    }

    gzip.end();
    await written;

    const { size: sizeBytes } = await fs.stat(tmpPath);
    let location: string;

    if (offSite && r2Client && backupBucket) {
      // Streamed from disk with a known length — the file is never held in
      // memory as a Buffer.
      await r2Client.send(new PutObjectCommand({
        Bucket: backupBucket,
        Key: `backups/${filename}`,
        Body: createReadStream(tmpPath),
        ContentLength: sizeBytes,
        ContentType: 'application/gzip',
      }));
      location = `r2:backups/${filename}`;

      // Nothing pruned these, so daily backups of a growing database would
      // have accumulated in R2 indefinitely.
      try {
        const listed = await r2Client.send(new ListObjectsV2Command({ Bucket: backupBucket, Prefix: 'backups/' }));
        const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k).sort();
        const stale = keys.slice(0, Math.max(0, keys.length - R2_RETENTION));
        if (stale.length) {
          await r2Client.send(new DeleteObjectsCommand({
            Bucket: backupBucket,
            Delete: { Objects: stale.map((Key) => ({ Key })), Quiet: true },
          }));
          console.log(`[admin/backup] pruned ${stale.length} backup(s) beyond the last ${R2_RETENTION}`);
        }
      } catch (err) {
        // Never fail a successful backup because tidying afterwards didn't work.
        console.error('[admin/backup] retention prune failed:', err);
      }
    } else {
      // A backup on the same box as the database it protects is not a backup
      // — it dies with the server. This path exists so a dev install still
      // works, and says so loudly rather than looking healthy.
      console.error(
        '[admin/backup] R2_BACKUP_BUCKET_NAME is not configured — writing to local disk on the app ' +
        'server. This does NOT protect against losing the server. Set it in Admin → Integrations.'
      );
      const dir = path.join(process.cwd(), 'backups');
      await fs.mkdir(dir, { recursive: true });
      await fs.copyFile(tmpPath, path.join(dir, filename));
      location = `local:backups/${filename}`;

      const files = (await fs.readdir(dir)).filter((f) => f.startsWith('backup-')).sort();
      const excess = files.slice(0, Math.max(0, files.length - 14));
      await Promise.all(excess.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})));
    }

    const documents = Object.values(counts).reduce((n, c) => n + c, 0);
    return NextResponse.json({
      ok: true,
      location,
      sizeBytes,
      documents,
      collections: Object.keys(counts).filter((c) => !c.startsWith('__')).length,
      // Reported explicitly because this is the one part that silently opts
      // out, and the part whose absence makes a restore useless.
      authUsers,
      warning: offSite ? undefined : 'Local disk only — Firebase Auth accounts were NOT backed up. Set R2_BACKUP_BUCKET_NAME.',
    });
  } catch (err) {
    console.error('[admin/backup] Error:', err);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  } finally {
    // The temp file is the full database in plaintext-gzip. Remove it whether
    // the upload succeeded or not.
    await fs.unlink(tmpPath).catch(() => {});
  }
}
