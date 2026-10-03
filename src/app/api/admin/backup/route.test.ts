import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gunzipSync } from 'zlib';
import { makeAdminDb } from '@/test/fakeAdminDb';

/**
 * The backup is the last line of defence, and it was just rewritten from
 * "build the whole database in memory then stringify it" to a streamed,
 * paged, gzipped JSONL writer. Compiling proves nothing about whether the
 * file it produces can actually be read back, so these tests gunzip the
 * uploaded object and parse it line by line — the same thing a restore does.
 */

let db = makeAdminDb();
let uploaded: Buffer | null = null;
let authUserPages: { users: unknown[]; pageToken?: string }[] = [];
let bucketConfigured = true;

vi.mock('@/lib/firebase-admin', () => ({ getAdminApp: () => ({}), getAdminDb: () => db }));
vi.mock('@/lib/verifyAdmin', () => ({ verifyAdmin: async () => ({ uid: 'admin' }) }));
vi.mock('@/lib/secrets', () => ({
  getSecret: async (k: string) => (k === 'R2_BACKUP_BUCKET_NAME' && bucketConfigured ? 'wf-backups' : ''),
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    listUsers: async (_n: number, token?: string) => {
      const i = token ? Number(token) : 0;
      return authUserPages[i] ?? { users: [], pageToken: undefined };
    },
  }),
}));
vi.mock('@/lib/r2', () => ({
  getR2Client: async () => (bucketConfigured ? {
    send: async (cmd: { input: Record<string, unknown> }) => {
      // PutObject carries a Readable body; drain it the way R2 would.
      const body = cmd.input.Body as NodeJS.ReadableStream | undefined;
      if (body && typeof body.on === 'function') {
        const chunks: Buffer[] = [];
        await new Promise<void>((res, rej) => {
          body.on('data', (c: Buffer) => chunks.push(c));
          body.on('end', () => res());
          body.on('error', rej);
        });
        uploaded = Buffer.concat(chunks);
      }
      return { Contents: [] };
    },
  } : null),
}));

const { POST } = await import('./route');
const run = () => POST(new Request('http://localhost:3000/api/admin/backup', {
  method: 'POST', headers: { authorization: 'Bearer cron' },
}) as never);

/** Parses the uploaded artifact exactly as a restore would. */
function readBackup() {
  const lines = gunzipSync(uploaded!).toString('utf8').trim().split('\n');
  return lines.map((l) => JSON.parse(l) as { c: string; id: string; d: Record<string, unknown> });
}

beforeEach(() => {
  db = makeAdminDb();
  uploaded = null;
  authUserPages = [];
  bucketConfigured = true;
  process.env.CRON_SECRET = 'cron';
});

describe('admin/backup — the artifact is readable', () => {
  it('writes a gzipped JSONL file whose every line parses', async () => {
    db.docs.set('users/u1', { displayName: 'Alice', xp: 40 });
    db.docs.set('users/u2', { displayName: 'Bob' });
    db.docs.set('events/e1', { userId: 'u1', type: 'WORKOUT_COMPLETED' });

    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.location).toMatch(/^r2:backups\/backup-.*\.jsonl\.gz$/);

    const rows = readBackup();
    expect(rows[0]).toMatchObject({ c: '__meta', id: 'manifest' });
    expect(rows.filter((r) => r.c === 'users').map((r) => r.id).sort()).toEqual(['u1', 'u2']);
    expect(rows.find((r) => r.c === 'users' && r.id === 'u1')!.d.displayName).toBe('Alice');
    expect(rows.some((r) => r.c === 'events' && r.id === 'e1')).toBe(true);
  });

  it('pages past the 500-document limit without dropping or duplicating', async () => {
    for (let i = 0; i < 1201; i++) db.docs.set(`events/e${String(i).padStart(4, '0')}`, { n: i });
    await run();
    const ids = readBackup().filter((r) => r.c === 'events').map((r) => r.id);
    expect(ids.length).toBe(1201);
    expect(new Set(ids).size).toBe(1201);
  });

  it('excludes system/secrets but keeps system/config', async () => {
    db.docs.set('system/config', { appName: 'Warfare' });
    db.docs.set('system/secrets', { OPENAI_API_KEY: { ciphertext: 'x' } });
    await run();
    const sys = readBackup().filter((r) => r.c === 'system');
    expect(sys.map((r) => r.id)).toEqual(['config']);
  });

  it('includes Auth accounts with their password hashes', async () => {
    authUserPages = [{
      users: [{
        uid: 'u1', email: 'a@b.c', emailVerified: true, displayName: 'Alice', photoURL: null,
        disabled: false, passwordHash: 'HASH', passwordSalt: 'SALT', customClaims: null,
        providerData: [{ providerId: 'password', uid: 'a@b.c', email: 'a@b.c' }],
        multiFactor: { enrolledFactors: [] }, metadata: { creationTime: 'x', lastSignInTime: 'y' },
      }],
    }];
    const body = await (await run()).json();
    expect(body.authUsers).toBe(1);
    const acct = readBackup().find((r) => r.c === '__authUsers')!;
    expect(acct.id).toBe('u1');
    expect(acct.d.passwordHash).toBe('HASH');
    expect(acct.d.passwordSalt).toBe('SALT');
  });

  it('nests support ticket messages onto the ticket', async () => {
    db.docs.set('supportTickets/t1', { subject: 'Billing' });
    db.docs.set('supportTickets/t1/messages/m1', { content: 'help' });
    await run();
    const t = readBackup().find((r) => r.c === 'supportTickets')!;
    expect((t.d.messages as unknown[]).length).toBe(1);
  });

  it('skips Auth accounts — and says so — when no private bucket is configured', async () => {
    bucketConfigured = false;
    authUserPages = [{ users: [{ uid: 'u1', passwordHash: 'HASH', providerData: [], metadata: {} }] }];
    const body = await (await run()).json();
    expect(body.authUsers).toBeNull();
    expect(body.location).toMatch(/^local:/);
    expect(body.warning).toMatch(/NOT backed up/);
  });
});
