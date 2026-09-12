import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gzipSync } from 'zlib';
import { Readable } from 'stream';
import { Timestamp } from 'firebase-admin/firestore';
import { makeAdminDb } from '@/test/fakeAdminDb';

/**
 * These tests exist because this is code that writes to the production
 * database. The three things that would do real damage if wrong:
 *
 *   1. A preview that isn't really a preview (writes while claiming not to).
 *   2. A scope filter that leaks — restoring one member's data over someone
 *      else's, or a whole collection when one document was asked for.
 *   3. Timestamps coming back as {_seconds,_nanoseconds}, which writes
 *      successfully and then silently breaks every date query in the app.
 *
 * Plus: __authUsers lines must never be written, at any scope.
 */

let bucketConfigured = true;
let backupBody = '';

vi.mock('@/lib/secrets', () => ({
  getSecret: async (k: string) => (k === 'R2_BACKUP_BUCKET_NAME' && bucketConfigured ? 'wf-backups' : ''),
}));
vi.mock('@/lib/r2', () => ({
  getR2Client: async () => (bucketConfigured ? {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      if (cmd.constructor.name === 'ListObjectsV2Command') {
        return {
          Contents: [
            { Key: 'backups/backup-2026-09-01T03-22-00-000Z.jsonl.gz', Size: 10, LastModified: new Date('2026-09-01') },
            { Key: 'backups/backup-2026-09-05T03-22-00-000Z.jsonl.gz', Size: 20, LastModified: new Date('2026-09-05') },
          ],
          IsTruncated: false,
        };
      }
      return { Body: Readable.from(gzipSync(Buffer.from(backupBody))) };
    },
  } : null),
}));

const { runRestore, listBackups, confirmPhraseFor } = await import('@/lib/restore');

const lines = (...rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

let db: ReturnType<typeof makeAdminDb>;
beforeEach(() => {
  db = makeAdminDb();
  bucketConfigured = true;
  backupBody = lines(
    { c: '__meta', id: 'manifest', d: { version: 2, createdAt: '2026-09-05T03:22:00.000Z' } },
    { c: 'programs', id: 'p1', d: { name: 'Murph', createdAt: { _seconds: 1700000000, _nanoseconds: 500 } } },
    { c: 'programs', id: 'p2', d: { name: 'Bravo' } },
    { c: 'users', id: 'u1', d: { displayName: 'Alice' } },
    { c: 'users', id: 'u2', d: { displayName: 'Bob' } },
    { c: 'goals', id: 'g1', d: { userId: 'u1', target: 100 } },
    { c: 'goals', id: 'g2', d: { userId: 'u2', target: 50 } },
    { c: 'channels', id: 'c1', d: { name: 'general', posts: [{ id: 'po1', text: 'hi', replies: [{ id: 'r1', text: 'yo' }] }] } },
    { c: 'supportTickets', id: 't1', d: { subject: 'help', messages: [{ id: 'm1', text: 'broken' }] } },
    { c: 'pushSubscriptions', id: 'dev1', d: { userId: 'u1', endpoint: 'https://x' } },
    { c: '__authUsers', id: 'u1', d: { email: 'a@b.c', passwordHash: 'SECRET', passwordSalt: 'SALT' } },
  );
});

const run = (scope: Parameters<typeof runRestore>[0]['scope'], apply: boolean) =>
  runRestore({ db: db as never, key: 'backups/x.jsonl.gz', scope, apply });

describe('runRestore', () => {
  it('preview writes nothing', async () => {
    const plan = await run({ type: 'collection', value: 'programs' }, false);
    expect(plan.documents).toBe(2);
    expect(plan.written).toBe(0);
    expect(db.docs.size).toBe(0);
  });

  it('restores a collection and nothing else', async () => {
    const plan = await run({ type: 'collection', value: 'programs' }, true);
    expect(plan.written).toBe(2);
    expect([...db.docs.keys()].sort()).toEqual(['programs/p1', 'programs/p2']);
  });

  it('rebuilds Timestamps rather than writing {_seconds,_nanoseconds}', async () => {
    await run({ type: 'collection', value: 'programs' }, true);
    const createdAt = db.docs.get('programs/p1')!.createdAt;
    expect(createdAt).toBeInstanceOf(Timestamp);
    expect((createdAt as Timestamp).seconds).toBe(1700000000);
    expect((createdAt as Timestamp).nanoseconds).toBe(500);
  });

  it('user scope takes that profile plus their attributed documents, and no one else\'s', async () => {
    const plan = await run({ type: 'user', value: 'u1' }, true);
    const keys = [...db.docs.keys()].sort();
    expect(keys).toEqual(['goals/g1', 'pushSubscriptions/u1/devices/dev1', 'users/u1']);
    expect(keys.some((k) => k.includes('u2') || k.includes('g2'))).toBe(false);
    expect(plan.written).toBe(3);
  });

  it('expands nested subcollections back to real paths', async () => {
    await run({ type: 'collection', value: 'channels' }, true);
    expect([...db.docs.keys()].sort()).toEqual([
      'channels/c1',
      'channels/c1/posts/po1',
      'channels/c1/posts/po1/replies/r1',
    ]);
    // The nested arrays are unwrapped, not left on the parent document.
    expect(db.docs.get('channels/c1')!.posts).toBeUndefined();
    expect(db.docs.get('channels/c1/posts/po1')!.replies).toBeUndefined();

    await run({ type: 'collection', value: 'supportTickets' }, true);
    expect(db.docs.get('supportTickets/t1/messages/m1')!.text).toBe('broken');
  });

  it('never writes Auth accounts, and says how many it skipped', async () => {
    for (const scope of [
      { type: 'collection' as const, value: 'users' },
      { type: 'user' as const, value: 'u1' },
      { type: 'collection' as const, value: '__authUsers' },
    ]) {
      db = makeAdminDb();
      const plan = await run(scope, true);
      expect(plan.skippedAuthAccounts).toBe(1);
      expect([...db.docs.keys()].some((k) => k.includes('authUsers'))).toBe(false);
      expect(JSON.stringify([...db.docs.values()])).not.toContain('SECRET');
    }
  });

  it('reads the manifest and reports per-collection counts', async () => {
    const plan = await run({ type: 'user', value: 'u1' }, false);
    expect(plan.manifest?.createdAt).toBe('2026-09-05T03:22:00.000Z');
    expect(plan.counts).toEqual({ users: 1, goals: 1, pushSubscriptions: 1 });
  });

  it('an unknown scope matches nothing rather than everything', async () => {
    const plan = await run({ type: 'collection', value: 'nope' }, true);
    expect(plan.documents).toBe(0);
    expect(db.docs.size).toBe(0);
  });

  it('skips malformed lines instead of aborting the restore', async () => {
    backupBody = 'not json\n\n' + backupBody;
    const plan = await run({ type: 'collection', value: 'programs' }, true);
    expect(plan.written).toBe(2);
  });

  it('refuses to run when the backup bucket is not configured', async () => {
    bucketConfigured = false;
    await expect(run({ type: 'collection', value: 'programs' }, true)).rejects.toThrow(/R2_BACKUP_BUCKET_NAME/);
  });
});

describe('confirmPhraseFor', () => {
  it('names the scope, so a phrase typed for one restore does not fit another', () => {
    expect(confirmPhraseFor({ type: 'collection', value: 'programs' })).toBe('restore collection programs');
    expect(confirmPhraseFor({ type: 'user', value: 'u1' })).toBe('restore user u1');
    expect(confirmPhraseFor({ type: 'user', value: 'u1' }))
      .not.toBe(confirmPhraseFor({ type: 'user', value: 'u2' }));
  });
});

describe('listBackups', () => {
  it('lists newest first', async () => {
    const out = await listBackups();
    expect(out.map((b) => b.key)).toEqual([
      'backups/backup-2026-09-05T03-22-00-000Z.jsonl.gz',
      'backups/backup-2026-09-01T03-22-00-000Z.jsonl.gz',
    ]);
  });

  it('is empty rather than throwing when R2 is not configured', async () => {
    bucketConfigured = false;
    expect(await listBackups()).toEqual([]);
  });
});
