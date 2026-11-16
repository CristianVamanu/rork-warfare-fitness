import { describe, it, expect, vi } from 'vitest';
import { makeAdminDb } from '@/test/fakeAdminDb';

/** Financial data is admin-only on the server, whatever the UI shows. */
const db = makeAdminDb();
let isAdmin = false;
vi.mock('@/lib/firebase-admin', () => ({ getAdminApp: () => ({}), getAdminDb: () => db }));
vi.mock('@/lib/verifyAdmin', () => ({ verifyAdmin: async () => (isAdmin ? { uid: 'admin1' } : { error: 'Access denied: admin only', status: 403 }) }));
vi.mock('@/lib/stripe', () => ({ getStripe: async () => { throw new Error('not used'); } }));

const { GET } = await import('./route');
const { GET: EXPORT } = await import('./export/route');
const req = (path: string) => { const u = new URL(`http://x${path}`); return Object.assign(new Request(u, { headers: { authorization: 'Bearer t' } }), { nextUrl: u }) as never; };

describe('finance endpoints require an admin', () => {
  it('GET views return 403 for a non-admin', async () => {
    for (const view of ['overview', 'customers', 'transactions', 'subscriptions', 'recovery', 'refunds', 'forecast']) {
      expect((await GET(req(`/api/admin/finance?view=${view}`))).status).toBe(403);
    }
  });
  it('exports return 403 for a non-admin', async () => {
    expect((await EXPORT(req('/api/admin/finance/export?kind=customers'))).status).toBe(403);
  });
  it('an admin with an empty mirror gets an empty overview that asks for the first sync', async () => {
    isAdmin = true;
    const res = await GET(req('/api/admin/finance?view=overview&tz=UTC'));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.needsSync).toBe(true);
    expect(j.kpis.revenue.gross).toBe(0);
    expect(j.kpis.mrr.now).toBe(0);
  });
});
