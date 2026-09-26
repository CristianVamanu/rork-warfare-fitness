import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeAdminDb, FV } from '@/test/fakeAdminDb';

/**
 * Email failures used to be a console.error and nothing else, which meant a
 * Resend outage stopped password resets, 2FA codes and dunning mail with no
 * signal anywhere. These tests pin the two things that make it visible:
 *
 *   1. A retryable failure is actually retried before giving up.
 *   2. The failure row matches what the daily digest QUERIES for. The digest
 *      does orderBy('lastSeenAt'), and Firestore silently omits documents
 *      missing the ordered field — so a row without it would sit in the
 *      collection forever and never appear in the digest. That is the exact
 *      bug this whole change exists to prevent, so it is asserted directly.
 */

let db = makeAdminDb();
let sendImpl: () => Promise<unknown> = async () => ({ id: 'ok' });
let apiKey = 'test-key';

vi.mock('./secrets', () => ({
  getSecret: async (k: string) => (k === 'RESEND_API_KEY' ? apiKey : 'App <a@b.c>'),
}));
vi.mock('resend', () => ({
  Resend: class { emails = { send: () => sendImpl() }; },
}));
vi.mock('./firebase-admin', () => ({ getAdminApp: () => ({}), getAdminDb: () => db }));
// The fake db resolves ITS OWN sentinel shape, so FieldValue has to be the
// fake's too — otherwise increment() lands as an unresolved object and a
// counter that never counts would pass unnoticed.
vi.mock('firebase-admin/firestore', () => ({ FieldValue: FV }));

const { sendEmail } = await import('./email');

const failWith = (status: number | undefined) => {
  const e = new Error(`boom ${status ?? 'network'}`) as Error & { statusCode?: number };
  if (status !== undefined) e.statusCode = status;
  return e;
};
const rows = () => [...db.docs.entries()].filter(([p]) => p.startsWith('errorReports/'));

beforeEach(() => {
  db = makeAdminDb();
  apiKey = 'test-key';
  sendImpl = async () => ({ id: 'ok' });
  vi.useRealTimers();
});

describe('sendEmail', () => {
  it('returns true and records nothing when the send succeeds', async () => {
    expect(await sendEmail({ to: 'a@b.c', subject: 'Hi', html: '<p/>' })).toBe(true);
    expect(rows()).toHaveLength(0);
  });

  it('retries once on a rate limit, and succeeds on the retry', async () => {
    let calls = 0;
    sendImpl = async () => { calls++; if (calls === 1) throw failWith(429); return { id: 'ok' }; };
    expect(await sendEmail({ to: 'a@b.c', subject: 'Code', html: '<p/>' })).toBe(true);
    expect(calls).toBe(2);
    expect(rows()).toHaveLength(0);
  });

  it('does not retry a permanent rejection', async () => {
    let calls = 0;
    sendImpl = async () => { calls++; throw failWith(422); };
    expect(await sendEmail({ to: 'bad', subject: 'Code', html: '<p/>' })).toBe(false);
    expect(calls).toBe(1);
  });

  it('records a failure row the digest can actually find', async () => {
    sendImpl = async () => { throw failWith(500); };
    expect(await sendEmail({ to: 'a@b.c', subject: 'Your sign-in code', html: '<p/>' })).toBe(false);

    const [[, doc]] = rows();
    // The digest filters on resolved and orders by lastSeenAt — both must be
    // present or the row is invisible to it.
    expect(doc.resolved).toBe(false);
    expect(doc.lastSeenAt).toBeDefined();
    expect(doc.count).toBe(1);
    expect(doc.kind).toBe('email');
    expect(doc.lastSubject).toBe('Your sign-in code');
    expect(String(doc.message)).toContain('Email send failed');
  });

  it('collapses an outage into one counted row, not one row per recipient', async () => {
    sendImpl = async () => { throw failWith(500); };
    for (const to of ['a@b.c', 'd@e.f', 'g@h.i']) {
      await sendEmail({ to, subject: 'Trial ending', html: '<p/>' });
    }
    expect(rows()).toHaveLength(1);
    expect(rows()[0][1].count).toBe(3);
  });

  it('records the misconfiguration when no API key is set', async () => {
    apiKey = '';
    expect(await sendEmail({ to: 'a@b.c', subject: 'Hi', html: '<p/>' })).toBe(false);
    expect(String(rows()[0][1].message)).toContain('RESEND_API_KEY');
  });

  it('reopens a row that was marked resolved', async () => {
    sendImpl = async () => { throw failWith(500); };
    await sendEmail({ to: 'a@b.c', subject: 'Hi', html: '<p/>' });
    const [path] = rows()[0];
    db.docs.set(path, { ...db.docs.get(path)!, resolved: true });
    await sendEmail({ to: 'a@b.c', subject: 'Hi', html: '<p/>' });
    expect(db.docs.get(path)!.resolved).toBe(false);
    expect(db.docs.get(path)!.reopenedAt).toBeDefined();
  });

  it('never lets a logging failure become a second failure', async () => {
    sendImpl = async () => { throw failWith(500); };
    db = { ...db, collection: () => { throw new Error('firestore down'); } } as unknown as ReturnType<typeof makeAdminDb>;
    // Still returns false rather than throwing into the caller.
    expect(await sendEmail({ to: 'a@b.c', subject: 'Hi', html: '<p/>' })).toBe(false);
  });

  it('refuses an empty recipient without calling Resend', async () => {
    let calls = 0;
    sendImpl = async () => { calls++; return { id: 'ok' }; };
    expect(await sendEmail({ to: '', subject: 'Hi', html: '<p/>' })).toBe(false);
    expect(calls).toBe(0);
  });
});
