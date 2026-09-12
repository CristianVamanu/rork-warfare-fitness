import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createGunzip } from 'zlib';
import readline from 'readline';
import { Readable } from 'stream';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getR2Client } from '@/lib/r2';
import { getSecret } from '@/lib/secrets';

/**
 * Reading a backup produced by /api/admin/backup (format v2) and putting
 * parts of it back.
 *
 * SCOPE IS DELIBERATELY LIMITED. This powers the admin restore screen, which
 * only ever restores a single collection or a single member — not the whole
 * database, and never Firebase Auth accounts. Both exclusions are on purpose:
 *
 *  - A full rollback is unsafe while Stripe holds separate state. Restoring
 *    yesterday means a member who paid this morning vanishes from the database
 *    while Stripe keeps billing them, and a member who cancelled keeps access.
 *    That is chargeback territory, so it stays a deliberate CLI operation
 *    (scripts/restore.mjs) with reconciliation afterwards.
 *  - Restoring an Auth account silently reverts that person's password to an
 *    older one. Recoverable, but it is a support incident, not a button.
 *
 * Everything here streams: a backup is the whole database, and buffering one
 * in a request handler is how you kill a worker.
 */

export type RestoreScope =
  | { type: 'collection'; value: string }
  | { type: 'user'; value: string };

/**
 * The phrase an admin must type to apply a restore. It names the exact scope
 * so a confirmation typed for one restore can't be muscle-memoried into
 * another. Lives here rather than in the route because a Next.js route file
 * may only export route handlers and config.
 */
export function confirmPhraseFor(scope: RestoreScope): string {
  return `restore ${scope.type} ${scope.value}`;
}

export interface BackupObject {
  key: string;
  sizeBytes: number;
  lastModified: string | null;
}

export interface RestorePlan {
  manifest: { version?: number; createdAt?: string } | null;
  /** Documents matching the scope, by collection. */
  counts: Record<string, number>;
  documents: number;
  /** Lines that were skipped because this tool refuses to restore them. */
  skippedAuthAccounts: number;
}

async function bucket(): Promise<{ client: NonNullable<Awaited<ReturnType<typeof getR2Client>>>; name: string } | null> {
  const client = await getR2Client();
  const name = await getSecret('R2_BACKUP_BUCKET_NAME');
  if (!client || !name) return null;
  return { client, name };
}

/** Newest first — the list the admin screen shows. */
export async function listBackups(): Promise<BackupObject[]> {
  const b = await bucket();
  if (!b) return [];
  const out: BackupObject[] = [];
  let token: string | undefined;
  do {
    const page = await b.client.send(new ListObjectsV2Command({ Bucket: b.name, Prefix: 'backups/', ContinuationToken: token }));
    for (const o of page.Contents ?? []) {
      if (!o.Key) continue;
      out.push({ key: o.Key, sizeBytes: o.Size ?? 0, lastModified: o.LastModified?.toISOString() ?? null });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b2) => (a.key < b2.key ? 1 : -1));
}

/**
 * JSON.stringify turns a Firestore Timestamp into {_seconds,_nanoseconds}.
 * Writing that back leaves a plain map where a date used to be, and every
 * date comparison in the app silently stops matching. Rebuild them.
 */
function revive(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o._seconds === 'number' && typeof o._nanoseconds === 'number') {
      return new Timestamp(o._seconds, o._nanoseconds);
    }
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) out[k] = revive(val);
    return out;
  }
  return v;
}

function matches(scope: RestoreScope, c: string, id: string, d: Record<string, unknown>): boolean {
  if (scope.type === 'collection') return c === scope.value;
  // A member's own footprint: their profile document, plus anything across
  // the database attributed to them.
  return (c === 'users' && id === scope.value) || d.userId === scope.value;
}

/** Paths whose children were nested onto the parent line at backup time. */
function expand(c: string, id: string, d: Record<string, unknown>): { path: string; data: Record<string, unknown> }[] {
  if (c === 'channels') {
    const { posts = [], ...channel } = d as { posts?: Record<string, unknown>[] };
    const rows = [{ path: `channels/${id}`, data: channel }];
    for (const p of posts) {
      const { id: pid, replies = [], ...post } = p as { id: string; replies?: Record<string, unknown>[] };
      rows.push({ path: `channels/${id}/posts/${pid}`, data: post });
      for (const r of replies) {
        const { id: rid, ...reply } = r as { id: string };
        rows.push({ path: `channels/${id}/posts/${pid}/replies/${rid}`, data: reply });
      }
    }
    return rows;
  }
  if (c === 'conversations' || c === 'supportTickets') {
    const { messages = [], ...parent } = d as { messages?: Record<string, unknown>[] };
    const rows = [{ path: `${c}/${id}`, data: parent }];
    for (const m of messages) {
      const { id: mid, ...msg } = m as { id: string };
      rows.push({ path: `${c}/${id}/messages/${mid}`, data: msg });
    }
    return rows;
  }
  if (c === 'pushSubscriptions') {
    const { userId, ...device } = d as { userId?: string };
    return userId ? [{ path: `pushSubscriptions/${userId}/devices/${id}`, data: device }] : [];
  }
  return [{ path: `${c}/${id}`, data: d }];
}

/**
 * Streams the backup, and either counts what a restore would touch (`apply`
 * false) or writes it (`apply` true). Never deletes: a document created since
 * the backup is left alone rather than removed, so this can undo a bad write
 * but cannot undo a creation.
 */
export async function runRestore(opts: {
  db: Firestore;
  key: string;
  scope: RestoreScope;
  apply: boolean;
}): Promise<RestorePlan & { written: number }> {
  const b = await bucket();
  if (!b) throw new Error('R2_BACKUP_BUCKET_NAME is not configured');

  const obj = await b.client.send(new GetObjectCommand({ Bucket: b.name, Key: opts.key }));
  if (!obj.Body) throw new Error('Backup object has no body');

  const rl = readline.createInterface({
    input: (obj.Body as Readable).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  const plan: RestorePlan & { written: number } = {
    manifest: null, counts: {}, documents: 0, skippedAuthAccounts: 0, written: 0,
  };

  let batch = opts.apply ? opts.db.batch() : null;
  let pending = 0;
  const flush = async () => {
    if (!batch || pending === 0) return;
    await batch.commit();
    plan.written += pending;
    batch = opts.db.batch();
    pending = 0;
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    let row: { c: string; id: string; d: Record<string, unknown> };
    try { row = JSON.parse(line); } catch { continue; }

    if (row.c === '__meta') { plan.manifest = row.d as RestorePlan['manifest']; continue; }
    // Never restored from here — see the note at the top of this file.
    if (row.c === '__authUsers') { plan.skippedAuthAccounts++; continue; }

    if (!matches(opts.scope, row.c, row.id, row.d)) continue;

    for (const { path, data } of expand(row.c, row.id, row.d)) {
      plan.counts[row.c] = (plan.counts[row.c] ?? 0) + 1;
      plan.documents++;
      if (batch) {
        batch.set(opts.db.doc(path), revive(data) as Record<string, unknown>, { merge: false });
        if (++pending >= 400) await flush();
      }
    }
  }
  await flush();
  return plan;
}
