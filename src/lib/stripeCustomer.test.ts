import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateStripeCustomer, CUSTOMER_INDEX } from './stripeCustomer';

/**
 * The resolver decides which Stripe billing account a request acts on, so its
 * failure mode is not "checkout is broken" but "this member is looking at
 * someone else's invoices". Tested accordingly.
 */

interface Doc { [k: string]: unknown }

function makeDb() {
  const docs = new Map<string, Doc>();
  const make = (path: string) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: Doc, opts?: { merge?: boolean }) => {
      docs.set(path, { ...(opts?.merge ? docs.get(path) : {}), ...data });
    },
  });
  return {
    docs,
    collection: (c: string) => ({ doc: (d: string) => make(`${c}/${d}`) }),
    // Must return the callback's value — the resolver relies on the
    // transaction reporting which customer actually won the race.
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx = {
        get: async (ref: { path: string }) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
        set: (ref: { path: string }, data: Doc, opts?: { merge?: boolean }) => {
          docs.set(ref.path, { ...(opts?.merge ? docs.get(ref.path) : {}), ...data });
        },
      };
      return fn(tx);
    },
  };
}

let db: ReturnType<typeof makeDb>;
let created: { email?: string; metadata?: Record<string, string> }[];
let stripe: Record<string, unknown>;

const UID = 'u1';
const USER = `users/${UID}`;

function stripeStub(over: Record<string, unknown> = {}) {
  return {
    customers: {
      retrieve: async (id: string) => ({ id, deleted: false }),
      list: async () => ({ data: [] }),
      create: async (args: { email?: string; metadata?: Record<string, string> }) => {
        created.push(args);
        return { id: `cus_new${created.length}`, deleted: false };
      },
    },
    subscriptions: { retrieve: async () => null },
    ...over,
  };
}

beforeEach(() => {
  db = makeDb();
  created = [];
  db.docs.set(USER, { email: 'a@b.c', displayName: 'Ann' });
  stripe = stripeStub();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (uid = UID) => getOrCreateStripeCustomer({ db: db as any, stripe: stripe as any, uid, email: 'a@b.c' });

describe('getOrCreateStripeCustomer', () => {
  it('creates a customer and indexes it when the account has none', async () => {
    const id = await run();
    expect(created).toHaveLength(1);
    expect(db.docs.get(USER)!.stripeCustomerId).toBe(id);
    expect(db.docs.get(`${CUSTOMER_INDEX}/${id}`)!.uid).toBe(UID);
  });

  it('puts the uid in Stripe metadata so a customer traces back to an account', async () => {
    await run();
    expect(created[0].metadata).toEqual({ userId: UID });
  });

  it('reuses the mapped customer instead of minting another', async () => {
    const first = await run();
    created.length = 0;
    const second = await run();
    expect(second).toBe(first);
    expect(created).toHaveLength(0);
  });

  it('converges on one customer when calls race', async () => {
    // A double-click on Subscribe, or a retry on a slow connection. All three
    // read "no customer" and create one; only one may end up mapped, and every
    // caller must be told the same answer or they check out against different
    // billing accounts.
    const [a, b, c] = await Promise.all([run(), run(), run()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(db.docs.get(USER)!.stripeCustomerId).toBe(a);
    expect(db.docs.get(`${CUSTOMER_INDEX}/${a}`)!.uid).toBe(UID);
  });

  // ── The attack ────────────────────────────────────────────────────────────

  it('refuses a customer id the caller does not own', async () => {
    // firestore.rules now blocks writing this field, but the resolver must not
    // depend on that: a member pointing stripeCustomerId at someone else's
    // customer would otherwise open that person's billing portal.
    db.docs.set(`${CUSTOMER_INDEX}/cus_victim`, { uid: 'someone-else' });
    db.docs.set(USER, { email: 'a@b.c', stripeCustomerId: 'cus_victim' });
    const id = await run();
    expect(id).not.toBe('cus_victim');
    expect(created).toHaveLength(1);
  });

  it('refuses to repoint a customer already owned by another account', async () => {
    db.docs.set(`${CUSTOMER_INDEX}/cus_taken`, { uid: 'someone-else' });
    stripe = stripeStub({
      customers: {
        ...(stripe.customers as object),
        list: async () => ({ data: [{ id: 'cus_taken', deleted: false }] }),
        create: async () => { throw new Error('should not reach create'); },
      },
    });
    await expect(run()).rejects.toThrow(/already mapped to a different account/);
  });

  // ── Adopting what the old customer_email path left behind ─────────────────

  it('adopts the customer behind an existing subscription', async () => {
    db.docs.set(USER, { email: 'a@b.c', membership: { stripeSubscriptionId: 'sub_1' } });
    stripe = stripeStub({
      subscriptions: { retrieve: async () => ({ id: 'sub_1', customer: 'cus_fromsub' }) },
    });
    const id = await run();
    expect(id).toBe('cus_fromsub');
    expect(created).toHaveLength(0);
  });

  it('adopts an existing customer found by email rather than duplicating', async () => {
    stripe = stripeStub({
      customers: {
        ...(stripe.customers as object),
        list: async () => ({ data: [{ id: 'cus_byemail', deleted: false }] }),
      },
    });
    const id = await run();
    expect(id).toBe('cus_byemail');
    expect(created).toHaveLength(0);
    expect(db.docs.get(`${CUSTOMER_INDEX}/cus_byemail`)!.uid).toBe(UID);
  });

  // The lookup address must come from the account, not the caller. Three
  // checkout routes pass a userEmail straight out of the request body; if that
  // reached the lookup, posting a victim's address would adopt — and then open
  // the billing portal for — the victim's Stripe customer, as long as it
  // predated the reverse index and so had no owner to refuse the claim.
  it('never searches Stripe with a caller-supplied email', async () => {
    let searched: string | undefined;
    stripe = stripeStub({
      customers: {
        ...(stripe.customers as object),
        list: async (args: { email: string }) => {
          searched = args.email;
          return { data: args.email === 'victim@example.com' ? [{ id: 'cus_victim', deleted: false }] : [] };
        },
      },
    });
    const id = await getOrCreateStripeCustomer({
      db: db as never, stripe: stripe as never, uid: UID, email: 'victim@example.com',
    });
    expect(searched).toBe('a@b.c');           // the account's own address
    expect(id).not.toBe('cus_victim');
    expect(db.docs.get(`${CUSTOMER_INDEX}/cus_victim`)).toBeUndefined();
  });

  it('indexes a mapped-but-unindexed customer from before the index existed', async () => {
    db.docs.set(USER, { email: 'a@b.c', stripeCustomerId: 'cus_legacy' });
    const id = await run();
    expect(id).toBe('cus_legacy');
    expect(db.docs.get(`${CUSTOMER_INDEX}/cus_legacy`)!.uid).toBe(UID);
  });

  it('re-resolves when the mapped customer was deleted in Stripe', async () => {
    db.docs.set(USER, { email: 'a@b.c', stripeCustomerId: 'cus_gone' });
    stripe = stripeStub({
      customers: {
        ...(stripe.customers as object),
        retrieve: async (id: string) => (id === 'cus_gone' ? { id, deleted: true } : { id, deleted: false }),
      },
    });
    const id = await run();
    expect(id).not.toBe('cus_gone');
    expect(created).toHaveLength(1);
  });
});
