import type Stripe from 'stripe';
import type { Firestore } from 'firebase-admin/firestore';
import { resolveAccountEmail } from './accountEmail';

/**
 * One Stripe Customer per Warfare Fitness account, resolved once and reused.
 *
 * Every checkout route used to pass `customer_email`, which makes Stripe
 * create a BRAND NEW Customer for each session. Subscribe, cancel, subscribe
 * again and that one person exists in Stripe two or three times over, with
 * their payment methods and invoice history split between them. Two concrete
 * consequences:
 *
 *  - The billing portal had to find the Customer *through* a subscription, so
 *    anyone without a live subscription had no route to their own billing at
 *    all — no invoices, no card update, nothing.
 *  - Trial eligibility could never consult Stripe's own subscription history,
 *    because there was no durable customer whose history to read.
 *
 * Firestore has no UNIQUE constraint, so uniqueness comes from the document
 * ID: `stripeCustomers/{customerId}` holds the uid, and creating it is what
 * claims that customer. Two concurrent checkouts therefore cannot end up
 * mapping one uid to two customers.
 */

export const CUSTOMER_INDEX = 'stripeCustomers';

/**
 * Another account already owns this Stripe customer.
 *
 * Its own type rather than a message to match on, because the difference
 * between this and a real failure decides whether a member can pay.
 */
class CustomerOwnedByAnotherAccount extends Error {
  constructor(readonly customerId: string, readonly owner: string) {
    super(`Stripe customer ${customerId} is already mapped to a different account`);
    this.name = 'CustomerOwnedByAnotherAccount';
  }
}

/**
 * Returns the Stripe Customer ID for this user, creating one only if no
 * existing customer can be found.
 *
 * Resolution order matters — it exists to ADOPT the customers already created
 * by the old `customer_email` behaviour rather than orphaning them, which
 * would strand real invoice history:
 *
 *   1. Already mapped on the user document
 *   2. The customer behind an existing subscription
 *   3. A customer with this email address already in Stripe
 *   4. Create a new one
 */
export async function getOrCreateStripeCustomer(opts: {
  db: Firestore;
  stripe: Stripe;
  uid: string;
  email?: string | null;
  name?: string | null;
}): Promise<string> {
  const { db, stripe, uid, email, name } = opts;
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  const data = snap.data() ?? {};

  // The address used to FIND an existing customer must come from the account,
  // never from the caller. Three checkout routes pass a `userEmail` straight
  // out of the request body, and step 3 below adopts whatever customer that
  // address matches: post someone else's email, and if their Stripe customer
  // predates the reverse index (exactly the case step 3 exists to migrate),
  // nothing owns it yet — so the claim succeeds and the billing portal then
  // opens THEIR invoices, card and cancel button. users/{uid}.email is written
  // only by the server (signup, and change-email, which rejects an address
  // already registered), so it is the account's real address.
  // Auth first, document second — see accountEmail.ts for why the document
  // alone stopped being safe once recoverEmail was handled.
  const accountEmail = await resolveAccountEmail(opts.uid, data.email as string | undefined);
  // Only ever used for CREATING a customer that doesn't exist yet, and only
  // when the account somehow has no email of its own — it decides where
  // receipts go, so a caller-supplied value must not win over the real one.
  const createEmail = accountEmail ?? email ?? undefined;

  // 1 — already mapped.
  //
  // The value on the user document is NOT trusted on its own. firestore.rules
  // now lists stripeCustomerId among the fields a member cannot write to their
  // own doc, but this check is the load-bearing half and stays regardless:
  // rules only cover the client path, and without it anything that did manage
  // to set the field could point at another person's customer and open that
  // person's billing portal — their invoices, their card, their cancel button.
  // The reverse index is the authority on who owns a customer; the user
  // document is only a cache of it.
  const mapped = data.stripeCustomerId as string | undefined;
  // Every customer this call has decided it must NOT settle on. More than one
  // can accumulate: the mapped id can be stolen or deleted, and an adoption
  // below can then hit a different unavailable customer.
  const rejected = new Set<string>();
  if (mapped) {
    const owner = (await db.collection(CUSTOMER_INDEX).doc(mapped).get()).data()?.uid as string | undefined;
    if (owner && owner !== uid) {
      console.error(`[stripeCustomer] ${uid} claims customer ${mapped} owned by ${owner} — ignoring`);
      rejected.add(mapped);
    } else {
      const existing = await stripe.customers.retrieve(mapped).catch(() => null);
      // An unindexed but real customer is an account that predates the index;
      // claim() below records it. A deleted one falls through and re-resolves,
      // rather than failing every future checkout with no way to recover.
      if (existing && !(existing as Stripe.DeletedCustomer).deleted) {
        return owner ? mapped : claim(db, userRef, uid, mapped);
      }
      rejected.add(mapped);
      console.warn(`[stripeCustomer] mapped customer ${mapped} for ${uid} is gone — re-resolving`);
    }
  }

  // Steps 2 and 3 ADOPT a customer that already exists. Adoption is a
  // convenience, so a customer that turns out to belong to someone else means
  // "do not adopt this one" — not "this person may never pay again", which is
  // what throwing here did. Seen in production: a checkout dead-ended on
  // "already mapped to a different account" with no way out, because step 3
  // kept matching the same unavailable customer by email on every retry.
  // Creating a fresh customer instead keeps the protection exactly as strong
  // (nobody reaches another account's invoices, card or cancel button) while
  // letting the sale complete.
  // `via` names which lookup produced the candidate, and the log names the
  // owner: without both, a production line reading "cannot adopt X" could
  // not be traced to a subscription id on this user's document (a data
  // problem worth chasing) or to an email match in Stripe (the normal
  // case for an address that was registered before, e.g. an account that
  // was deleted and re-created).
  const tryAdopt = async (customerId: string, via: 'subscription' | 'email'): Promise<string | null> => {
    try {
      return await claim(db, userRef, uid, customerId, rejected);
    } catch (err) {
      if (err instanceof CustomerOwnedByAnotherAccount) {
        console.error(`[stripeCustomer] ${uid} cannot adopt ${customerId} (found via ${via}, owned by ${err.owner}); creating a new customer instead`);
        rejected.add(customerId);
        return null;
      }
      throw err;
    }
  };

  // 2 — adopt the customer behind a subscription this user already has.
  const subId = (data.membership?.stripeSubscriptionId ?? data.coaching?.stripeSubscriptionId) as string | undefined;
  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId).catch(() => null);
    const fromSub = sub && (typeof sub.customer === 'string' ? sub.customer : sub.customer?.id);
    if (fromSub) {
      const adopted = await tryAdopt(fromSub, 'subscription');
      if (adopted) return adopted;
    }
  }

  // 3 — adopt a customer created by the old customer_email path. Matching on
  // email is weaker than an ID, which is exactly why it is third rather than
  // first: it is a migration path for existing accounts, not the mechanism.
  if (accountEmail) {
    const found = await stripe.customers.list({ email: accountEmail, limit: 1 }).catch(() => null);
    const candidate = found?.data?.[0];
    if (candidate && !candidate.deleted) {
      const adopted = await tryAdopt(candidate.id, 'email');
      if (adopted) return adopted;
    }
  }

  // 4 — create. The uid goes in metadata so a customer can be traced back to
  // an account from the Stripe dashboard alone. Nothing sensitive beyond the
  // email Stripe needs anyway for receipts.
  const created = await stripe.customers.create({
    email: createEmail,
    name: name ?? undefined,
    metadata: { userId: uid },
  });
  return claim(db, userRef, uid, created.id, rejected);
}

/**
 * Records the mapping in both directions, atomically.
 *
 * The reverse index is what gives Firestore the uniqueness property a SQL
 * `stripe_customer_id UNIQUE` would: the document ID *is* the constraint. If
 * another uid already claimed this customer, that is a genuine data conflict
 * and the write is refused rather than silently repointed — quietly moving a
 * customer between accounts is how one person ends up billed for another's
 * subscription.
 */
async function claim(
  db: Firestore,
  userRef: FirebaseFirestore.DocumentReference,
  uid: string,
  customerId: string,
  /** Mappings this call already rejected — stolen, or deleted in Stripe.
   *  Without them the compare-and-set below would hand a bad value straight
   *  back, undoing the rejection. */
  rejected: ReadonlySet<string> = new Set(),
): Promise<string> {
  const indexRef = db.collection(CUSTOMER_INDEX).doc(customerId);
  const winner = await db.runTransaction(async (tx) => {
    const [indexSnap, userSnap] = await Promise.all([tx.get(indexRef), tx.get(userRef)]);

    const owner = indexSnap.data()?.uid as string | undefined;
    if (owner && owner !== uid) {
      throw new CustomerOwnedByAnotherAccount(customerId, owner);
    }

    // Compare-and-set. Two checkouts racing — a double-click, or a retry on a
    // slow connection — both read "no customer", both create one in Stripe,
    // and both arrive here. Without this the later write silently repoints the
    // account at the second customer, stranding whatever the first one had
    // already been attached to. First writer wins; the loser adopts it.
    const already = userSnap.data()?.stripeCustomerId as string | undefined;
    if (already && already !== customerId && !rejected.has(already)) return already;

    if (!owner) tx.set(indexRef, { uid, createdAt: new Date() });
    tx.set(userRef, { stripeCustomerId: customerId }, { merge: true });
    return customerId;
  });

  if (winner !== customerId) {
    // The customer we created lost the race. It has no subscription and no
    // payment method attached — nothing ever referenced it — so it is left in
    // place rather than deleted: an unused Stripe customer costs nothing,
    // whereas a delete call here adds a failure path to the checkout of
    // whoever did win.
    console.warn(`[stripeCustomer] ${uid}: ${customerId} lost the race to ${winner}; leaving it unused`);
  } else {
    console.log(`[stripeCustomer] ${uid} → ${customerId}`);
  }
  return winner;
}
