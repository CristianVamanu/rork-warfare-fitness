export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Full Firestore export — every collection dumped to a single timestamped
 * JSON file. Uploaded to Cloudflare R2 if configured (real off-server
 * backup); otherwise saved to local disk under ./backups on the VPS as a
 * fallback, which is better than nothing but does NOT protect against
 * losing the whole server — only against application-level mistakes
 * (a bad deploy, an admin mistake, a bug that deletes data). Configure R2
 * for this to actually function as disaster recovery.
 *
 * Callable two ways:
 *   - By an admin from the browser (Admin -> Settings -> "Run Backup Now")
 *   - By a cron job on the VPS, authenticated with CRON_SECRET, e.g.:
 *       curl -X POST https://yourdomain.com/api/admin/backup \
 *         -H "Authorization: Bearer $CRON_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getR2Client } from '@/lib/r2';
import { getSecret } from '@/lib/secrets';
import { timingSafeEqualString } from '@/lib/crypto';

// Top-level collections that hold real data worth backing up.
//
// `system` is now included but its `secrets` document is filtered out below.
// The original exclusion was right about the secrets blob — there is no reason
// to copy encrypted API keys into a second location — but it also dropped
// system/config, which holds branding, the trainerId every user doc points at,
// and the AI spend caps. That is configuration you cannot reconstruct.
const COLLECTIONS = [
  'users', 'events', 'meals', 'waterLogs', 'workoutLogs', 'weightLogs', 'habitLogs',
  'programs', 'posts', 'notifications', 'coachingApplications', 'config',
  'prPosts', 'progressPhotos', 'userPreferences', 'exerciseLibrary',
  // Added after an audit found the dump was missing data that cannot be
  // reconstructed from anything else:
  //   system            — system/config (branding, AI caps, trainerId) and the
  //                       encrypted system/secrets document
  //   stripeCustomers   — the customer→uid reverse index. Losing it detaches
  //                       every member from their Stripe billing identity
  //   supportTickets    — members' own support conversations (messages are
  //                       pulled from the subcollection below)
  //   goals / ptTestResults / communityActivity — coach-assigned and
  //                       self-logged records with no other source
  //   trainerLeads / landingLeads — inbound sales enquiries
  //   orphanedSubscriptions — the record of subscriptions that failed to
  //                       cancel during account deletion, i.e. a live to-do
  //                       list of billing problems
  //   tenants           — per-trainer configuration
  //   leaderboardPublic — retired, but the rows still exist and are cheap
  'system', 'stripeCustomers', 'goals', 'ptTestResults', 'communityActivity',
  'trainerLeads', 'landingLeads', 'orphanedSubscriptions', 'tenants', 'leaderboardPublic',
] as const;

/**
 * Deliberately NOT backed up, because restoring them would be wrong or
 * pointless: rateLimits, users/*\/usage, twoFactorCodes, emailVerifyCodes and
 * trustedDevices are short-lived security/throttling state that must expire
 * rather than come back; stripeEvents is a replay ledger whose entries are
 * only meaningful against live Stripe deliveries; errorReports is diagnostics.
 */

/** Keep this many backups in R2. Older objects are pruned after each run. */
const R2_RETENTION = 30;

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

  try {
    const dump: Record<string, unknown[]> = {};

    for (const name of COLLECTIONS) {
      const snap = await db.collection(name).get();
      dump[name] = snap.docs
        // system/secrets holds encrypted third-party API keys. Configuration
        // is worth backing up; that blob is not — copying it into a second
        // store only widens where a key can leak from, and it is restorable
        // by pasting the keys back in.
        .filter((d) => !(name === 'system' && d.id === 'secrets'))
        .map((d) => ({ id: d.id, ...d.data() }));
    }

    // Nested subcollections that don't live at the top level
    const channelsSnap = await db.collection('channels').get();
    const channels: unknown[] = [];
    for (const chDoc of channelsSnap.docs) {
      const postsSnap = await chDoc.ref.collection('posts').get();
      const posts = await Promise.all(postsSnap.docs.map(async (p) => {
        const repliesSnap = await p.ref.collection('replies').get();
        return { id: p.id, ...p.data(), replies: repliesSnap.docs.map((r) => ({ id: r.id, ...r.data() })) };
      }));
      channels.push({ id: chDoc.id, ...chDoc.data(), posts });
    }
    dump.channels = channels;

    const convSnap = await db.collection('conversations').get();
    const conversations = await Promise.all(convSnap.docs.map(async (c) => {
      const msgsSnap = await c.ref.collection('messages').get();
      return { id: c.id, ...c.data(), messages: msgsSnap.docs.map((m) => ({ id: m.id, ...m.data() })) };
    }));
    dump.conversations = conversations;

    // Support tickets carry their messages in a subcollection, same shape as
    // conversations — a ticket without its messages is not a restore.
    const ticketSnap = await db.collection('supportTickets').get();
    dump.supportTickets = await Promise.all(ticketSnap.docs.map(async (t) => {
      const msgsSnap = await t.ref.collection('messages').get();
      return { id: t.id, ...t.data(), messages: msgsSnap.docs.map((m) => ({ id: m.id, ...m.data() })) };
    }));

    // pushSubscriptions/{userId}/devices/{deviceId} — a subcollection, not a
    // top-level collection, so it needs a collectionGroup query rather than
    // db.collection(name).get() like the flat COLLECTIONS list above.
    const devicesSnap = await db.collectionGroup('devices').get();
    dump.pushSubscriptions = devicesSnap.docs
      .filter((d) => d.ref.parent.parent?.parent.id === 'pushSubscriptions')
      .map((d) => ({ id: d.id, userId: d.ref.parent.parent?.id, ...d.data() }));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const json = JSON.stringify(dump);
    const sizeBytes = Buffer.byteLength(json);

    const r2Client = await getR2Client();
    // Deliberately NOT R2_BUCKET_NAME — that bucket serves public content
    // (exercise videos, PR Wall photos) and backups containing every user's
    // full data must never sit somewhere with public read access. Previously
    // fell back to R2_BUCKET_NAME (with only a console.warn) when
    // R2_BACKUP_BUCKET_NAME was unset — a warning nobody would ever see
    // unless they were already watching server logs at that exact moment.
    // Falls back to the local-disk path below instead, which stays private.
    const backupBucket = await getSecret('R2_BACKUP_BUCKET_NAME');
    let location: string;

    if (r2Client && backupBucket) {
      await r2Client.send(new PutObjectCommand({
        Bucket: backupBucket,
        Key: `backups/${filename}`,
        Body: json,
        ContentType: 'application/json',
      }));
      location = `r2:backups/${filename}`;

      // Prune old objects. Nothing was deleting these, so a daily backup of a
      // growing database would have accumulated in R2 indefinitely.
      try {
        const listed = await r2Client.send(new ListObjectsV2Command({ Bucket: backupBucket, Prefix: 'backups/' }));
        const keys = (listed.Contents ?? [])
          .map((o) => o.Key)
          .filter((k): k is string => !!k)
          .sort(); // ISO timestamps in the name sort chronologically
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
      // A backup written to the same box as the database it protects is not a
      // backup — it dies with the server. This path exists so a dev/staging
      // install still works, and says so loudly rather than looking healthy.
      console.error(
        '[admin/backup] R2_BACKUP_BUCKET_NAME is not configured — writing to local disk on the app server. ' +
        'This does NOT protect against losing the server. Set it in Admin → Integrations.'
      );
      const dir = path.join(process.cwd(), 'backups');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, filename), json, 'utf-8');
      location = `local:backups/${filename}`;

      // Keep only the last 14 local backups — R2 is unbounded (Cloudflare
      // bucket lifecycle rules can be set up separately if desired), but
      // the local fallback shouldn't quietly fill up the VPS disk forever.
      const files = (await fs.readdir(dir)).filter((f) => f.startsWith('backup-')).sort();
      const excess = files.slice(0, Math.max(0, files.length - 14));
      await Promise.all(excess.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})));
    }

    return NextResponse.json({ ok: true, location, sizeBytes, collections: Object.keys(dump).length });
  } catch (err) {
    console.error('[admin/backup] Error:', err);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
