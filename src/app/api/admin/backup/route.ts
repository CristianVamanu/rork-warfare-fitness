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
import { PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getR2Client } from '@/lib/r2';
import { getSecret } from '@/lib/secrets';

// Top-level collections that hold real data worth backing up. `system`
// (encrypted secrets ciphertext) is deliberately excluded — no reason to
// duplicate that blob into a second location.
const COLLECTIONS = [
  'users', 'events', 'meals', 'waterLogs', 'workoutLogs', 'weightLogs', 'habitLogs',
  'programs', 'posts', 'notifications', 'coachingApplications', 'config',
  'prPosts', 'progressPhotos', 'pushSubscriptions', 'userPreferences', 'exerciseLibrary',
] as const;

async function authorize(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { ok: true as const };

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
      dump[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const json = JSON.stringify(dump);
    const sizeBytes = Buffer.byteLength(json);

    const r2Client = await getR2Client();
    const bucket = await getSecret('R2_BUCKET_NAME');
    let location: string;

    if (r2Client && bucket) {
      await r2Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `backups/${filename}`,
        Body: json,
        ContentType: 'application/json',
      }));
      location = `r2:backups/${filename}`;
    } else {
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
