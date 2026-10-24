import { describe, it, expect, beforeEach } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { recordPartnerClick, attachPendingCode, lockAttribution, recordInvoiceCommission, recordClawback, setPartnerMembership } from './partnersServer';

/**
 * An in-memory Firestore with just enough surface for partnersServer: doc
 * get/set(merge)/create/update, equality + range `where` chains, and a serial
 * runTransaction. FieldValue.increment / delete / serverTimestamp sentinels
 * are resolved the way the real one would.
 */
function makeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  // firebase-admin's FieldValue sentinels are class instances: resolved by
  // class name, the way the real server would apply them.
  const kind = (v: unknown): 'inc' | 'del' | 'ts' | null => {
    if (!v || typeof v !== 'object') return null;
    const n = (v as object).constructor?.name ?? '';
    if (/Increment/.test(n)) return 'inc';
    if (/Delete/.test(n)) return 'del';
    if (/ServerTimestamp/.test(n)) return 'ts';
    return null;
  };
  const applyMerge = (cur: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> => {
    const out = { ...cur };
    for (const [k, v] of Object.entries(data)) {
      const s = kind(v);
      if (s === 'inc') out[k] = ((out[k] as number) ?? 0) + ((v as { operand: number }).operand ?? 0);
      else if (s === 'del') delete out[k];
      else if (s === 'ts') out[k] = new Date();
      else if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) out[k] = applyMerge((out[k] as Record<string, unknown>) ?? {}, v as Record<string, unknown>);
      else out[k] = v;
    }
    return out;
  };
  const getPath = (o: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o);
  const docRef = (path: string) => ({
    id: path.split('/').pop()!,
    get: async () => ({ exists: docs.has(path), id: path.split('/').pop()!, data: () => docs.get(path) }),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => { docs.set(path, opts?.merge ? applyMerge(docs.get(path) ?? {}, data) : applyMerge({}, data)); },
    create: async (data: Record<string, unknown>) => { if (docs.has(path)) throw new Error('ALREADY_EXISTS'); docs.set(path, applyMerge({}, data)); },
    update: async (data: Record<string, unknown>) => { if (!docs.has(path)) throw new Error('NOT_FOUND'); docs.set(path, applyMerge(docs.get(path)!, data)); },
  });
  const query = (col: string, filters: { f: string; op: string; v: unknown }[]) => ({
    where: (f: string, op: string, v: unknown) => query(col, [...filters, { f, op, v }]),
    limit: () => query(col, filters),
    get: async () => {
      const out = [...docs.entries()].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2)
        .filter(([, d]) => filters.every(({ f, op, v }) => {
          const x = getPath(d, f);
          if (op === '==') return x === v;
          if (op === '>=') return x instanceof Date && v instanceof Date ? x.getTime() >= v.getTime() : (x as number) >= (v as number);
          return true;
        }));
      return { empty: out.length === 0, size: out.length, docs: out.map(([p, d]) => ({ id: p.split('/').pop()!, data: () => d, ref: docRef(p) })) };
    },
  });
  const db = {
    docs,
    collection: (c: string) => ({ doc: (d: string) => docRef(`${c}/${d}`), where: (f: string, op: string, v: unknown) => query(c, [{ f, op, v }]), add: async (d: Record<string, unknown>) => docRef(`${c}/${Math.random()}`).set(d) }),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn({
      get: (ref: { get: () => Promise<unknown> }) => ref.get(),
      set: (ref: { set: (d: Record<string, unknown>, o?: { merge?: boolean }) => Promise<void> }, d: Record<string, unknown>, o?: { merge?: boolean }) => { void ref.set(d, o); },
    }),
  };
  return db;
}

let db: ReturnType<typeof makeDb>;
const F = () => db as unknown as Firestore;
const T0 = new Date('2026-03-10T12:00:00Z');

beforeEach(() => {
  db = makeDb();
  db.docs.set('config/partnerProgram', { defaultPercent: 30, holdDays: 30 });
  db.docs.set('partners/p1', { uid: 'p1', code: 'MIKE', status: 'active', profile: { name: 'Mike', email: 'mike@x.com' } });
  db.docs.set('partnerCodes/MIKE', { partnerId: 'p1' });
  db.docs.set('partners/p2', { uid: 'p2', code: 'OLD', status: 'suspended', profile: { name: 'Old', email: 'old@x.com' } });
  db.docs.set('partnerCodes/OLD', { partnerId: 'p2' });
  db.docs.set('users/m1', { email: 'ann@y.com', displayName: 'Ann Lee' });
});

describe('clicks', () => {
  it('counts a visitor once per day and ignores inactive codes', async () => {
    const a = { code: 'MIKE', ip: '1.2.3.4', ua: 'UA', landing: '/onboarding', now: T0 };
    expect(await recordPartnerClick(F(), a)).toBe(true);
    expect(await recordPartnerClick(F(), a)).toBe(false);
    expect(await recordPartnerClick(F(), { ...a, ip: '5.6.7.8' })).toBe(true);
    expect(await recordPartnerClick(F(), { ...a, now: new Date('2026-03-11T12:00:00Z') })).toBe(true);
    expect(await recordPartnerClick(F(), { ...a, code: 'OLD' })).toBe(false);
    expect(await recordPartnerClick(F(), { ...a, code: 'NOPE' })).toBe(false);
    expect((db.docs.get('partners/p1')!.totals as { clicks: number }).clicks).toBe(3);
    expect(db.docs.get('partnerStats/p1_2026-03')!.clicks).toBe(3);
    // nothing identifying is stored
    const click = [...db.docs.entries()].find(([p]) => p.startsWith('partnerClicks/'))![1];
    expect(JSON.stringify(click)).not.toContain('1.2.3.4');
    expect(JSON.stringify(click)).not.toContain('UA');
  });
});

describe('attach', () => {
  it('attaches a pending code, refuses self, inactive, unknown and locked', async () => {
    expect(await attachPendingCode(F(), { uid: 'm1', code: 'mike', source: 'link', now: T0 })).toMatchObject({ attached: true, partnerCode: 'MIKE' });
    expect((db.docs.get('users/m1')!.attribution as { pendingCode: string }).pendingCode).toBe('MIKE');
    expect((db.docs.get('partners/p1')!.totals as { signups: number }).signups).toBe(1);
    // same code again: no second signup counted
    await attachPendingCode(F(), { uid: 'm1', code: 'MIKE', source: 'link', now: T0 });
    expect((db.docs.get('partners/p1')!.totals as { signups: number }).signups).toBe(1);
    expect(await attachPendingCode(F(), { uid: 'p1', code: 'MIKE', source: 'link' })).toMatchObject({ attached: false, reason: 'self' });
    expect(await attachPendingCode(F(), { uid: 'm1', code: 'OLD', source: 'link' })).toMatchObject({ attached: false, reason: 'partner_inactive' });
    expect(await attachPendingCode(F(), { uid: 'm1', code: 'ZZZZ', source: 'link' })).toMatchObject({ attached: false, reason: 'unknown_code' });
    db.docs.set('users/m2', { attribution: { partnerId: 'p9', lockedAt: T0 } });
    expect(await attachPendingCode(F(), { uid: 'm2', code: 'MIKE', source: 'typed' })).toMatchObject({ attached: false, reason: 'locked' });
    db.docs.set('users/m3', { trialUsedAt: T0 });
    expect(await attachPendingCode(F(), { uid: 'm3', code: 'MIKE', source: 'typed' })).toMatchObject({ attached: false, reason: 'locked' });
  });
  it('a typed code is not overwritten by a cookie', async () => {
    db.docs.set('partners/p3', { uid: 'p3', code: 'JANE', status: 'active', profile: {} });
    db.docs.set('partnerCodes/JANE', { partnerId: 'p3' });
    await attachPendingCode(F(), { uid: 'm1', code: 'JANE', source: 'typed' });
    expect(await attachPendingCode(F(), { uid: 'm1', code: 'MIKE', source: 'link' })).toMatchObject({ attached: false, reason: 'typed_wins' });
    expect((db.docs.get('users/m1')!.attribution as { pendingCode: string }).pendingCode).toBe('JANE');
  });
});

describe('lock', () => {
  it('locks once and counts the member once', async () => {
    await attachPendingCode(F(), { uid: 'm1', code: 'MIKE', source: 'link' });
    expect(await lockAttribution(F(), { uid: 'm1', partnerId: 'p1', partnerCode: 'MIKE', now: T0 })).toBe(true);
    expect(await lockAttribution(F(), { uid: 'm1', partnerId: 'p1', partnerCode: 'MIKE', now: T0 })).toBe(false);
    expect(await lockAttribution(F(), { uid: 'm1', partnerId: 'p9', partnerCode: 'OTHER', now: T0 })).toBe(false);
    const a = db.docs.get('users/m1')!.attribution as { partnerId: string; pendingCode: string };
    expect(a.partnerId).toBe('p1');
    expect(a.pendingCode).toBe('MIKE');
    expect((db.docs.get('partners/p1')!.totals as { members: number }).members).toBe(1);
  });
});

describe('ledger', () => {
  const inv = (over: Partial<Parameters<typeof recordInvoiceCommission>[1]> = {}) => recordInvoiceCommission(F(), {
    invoiceId: 'in_1', memberUid: 'm1', partnerId: 'p1', partnerCode: 'MIKE', amountPaidCents: 2999, currency: 'usd', feeCents: 117,
    chargeId: 'ch_1', subscriptionId: 'sub_1', cardFingerprint: 'fp_a', planName: 'Pro', now: T0, ...over,
  });
  it('writes one row per invoice at the partner percentage, net of fees', async () => {
    const row = await inv();
    expect(row).toMatchObject({ status: 'pending', percent: 30, netCents: 2882, commissionCents: 865, flags: [] });
    expect(await inv()).toBeNull(); // duplicate delivery
    expect(await inv({ invoiceId: 'in_free', amountPaidCents: 0 })).toBeNull();
    expect((db.docs.get('partners/p1')!.totals as { commissionCents: number }).commissionCents).toBe(865);
  });
  it('uses the per-partner override and respects the cap', async () => {
    db.docs.set('partners/p1', { ...db.docs.get('partners/p1'), percentOverride: 40, capMonthsOverride: 3 });
    db.docs.set('users/m1', { ...db.docs.get('users/m1'), attribution: { partnerId: 'p1', lockedAt: new Date('2026-01-01') } });
    expect((await inv())!.commissionCents).toBe(Math.round(2882 * 0.4));
    expect(await inv({ invoiceId: 'in_late', now: new Date('2026-04-02') })).toBeNull(); // 3 months after lock
  });
  it('earns nothing for a suspended partner', async () => {
    db.docs.set('partners/p1', { ...db.docs.get('partners/p1'), status: 'suspended' });
    expect(await inv()).toBeNull();
  });
  it('flags a card shared across two members and a self-referral', async () => {
    await inv();
    db.docs.set('users/m2', { email: 'bob@z.com', displayName: 'Bob' });
    const r2 = await inv({ invoiceId: 'in_2', memberUid: 'm2' });
    expect(r2!.flags).toContain('shared_card');
    const r3 = await inv({ invoiceId: 'in_3', memberUid: 'p1', cardFingerprint: 'fp_z' });
    expect(r3!.flags).toContain('self_referral');
  });
  it('claws back the earned share on a partial refund, once per event', async () => {
    await inv();
    const cb = await recordClawback(F(), { invoiceId: 'in_1', chargeId: 'ch_1', refundedCents: 1500, eventId: 'evt_r1', reason: 'refund', now: T0 });
    expect(cb).toMatchObject({ status: 'clawback', commissionCents: -433, reverses: 'in_1' });
    expect(await recordClawback(F(), { invoiceId: 'in_1', chargeId: 'ch_1', refundedCents: 1500, eventId: 'evt_r1', reason: 'refund' })).toBeNull();
    // a still-pending original is rejected outright
    expect(db.docs.get('partnerLedger/in_1')!.status).toBe('rejected');
    // found by charge id when the invoice id is missing
    await inv({ invoiceId: 'in_9', chargeId: 'ch_9' });
    const cb2 = await recordClawback(F(), { invoiceId: null, chargeId: 'ch_9', refundedCents: 2999, eventId: 'evt_r2', reason: 'dispute' });
    expect(cb2!.commissionCents).toBe(-865);
    expect(await recordClawback(F(), { invoiceId: null, chargeId: 'ch_none', refundedCents: 100, eventId: 'evt_r3', reason: 'refund' })).toBeNull();
  });
});

describe('free membership perk', () => {
  it('grants only when there is no membership and revokes only its own grant', async () => {
    await setPartnerMembership(F(), 'p1', true);
    expect((db.docs.get('users/p1')!.membership as { status: string; source: string })).toMatchObject({ status: 'active', source: 'partner' });
    await setPartnerMembership(F(), 'p1', false);
    expect((db.docs.get('users/p1')!.membership as { status: string }).status).toBe('none');
    db.docs.set('users/p2', { membership: { status: 'active', stripeSubscriptionId: 'sub_x' } });
    await setPartnerMembership(F(), 'p2', true);
    await setPartnerMembership(F(), 'p2', false);
    expect((db.docs.get('users/p2')!.membership as { status: string }).status).toBe('active');
  });
});
