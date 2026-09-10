export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reconciles Firestore membership state against Stripe — the correction loop
 * the billing system was missing.
 *
 * Until this existed, Firestore was a pure forward projection of webhook
 * deliveries with no way to notice one that never arrived. Stripe retries a
 * failing endpoint for about three days and then gives up; if the lost event
 * was `customer.subscription.deleted`, that account kept `status: 'active'`
 * — full paid access, no subscription, forever, with nothing anywhere that
 * would ever surface it.
 *
 * `subscriptionGrantsAccess` now expires a stale record on its own once
 * `expiresAt` passes, which stops the bleeding. This closes the loop
 * properly: for every user Firestore believes is paying, ask Stripe what is
 * actually true and write back the answer.
 *
 * Auth: the same CRON_SECRET bearer as /api/notifications/process, or an
 * admin ID token so it can be triggered by hand from the admin panel.
 * Install alongside the existing hourly cron (see deploy.sh) at a daily
 * cadence — this is a safety net, not a hot path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getStripe } from '@/lib/stripe';
import { FieldValue } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { mapWithConcurrency } from '@/lib/concurrency';

type Field = 'membership' | 'coaching';
const FIELDS: Field[] = ['membership', 'coaching'];

// Users are read in pages and each page's Stripe lookups run a few at a
// time. This used to load every active subscriber in one query and then
// call Stripe strictly one after another — at 5,000 subscribers that is
// 5,000 sequential round trips, fifteen to twenty-five minutes, holding one
// of the two pm2 workers at half capacity every night. Stripe's live-mode
// limit is 100 requests/second; a window of 8 stays nowhere near it while
// cutting the run to a couple of minutes.
const PAGE_SIZE = 200;
const STRIPE_CONCURRENCY = 8;

function periodEnd(sub: Stripe.Subscription): Date | undefined {
  const end = sub.current_period_end
    ?? (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end;
  return end ? new Date(end * 1000) : undefined;
}

// Mirrors the webhook's own notion of "still counts as paying" — past_due is
// Stripe still retrying a card, not a lapse.
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Revokes one subscription record.
 *
 * MUST be update(), never set({...}, {merge:true}). update() reads
 * "membership.status" as a path into the map; set() does not — it writes a
 * top-level field whose NAME contains a dot and leaves the real
 * `membership.status` untouched. Every corrective write in this route used
 * set(), so for as long as it has existed it revoked nothing and refreshed
 * nothing: the query below kept matching the same still-active records, the
 * log reported the same "corrections" every night, and none of them landed.
 * This is the same defect that locked out a paying member from the webhook.
 */
async function revoke(ref: FirebaseFirestore.DocumentReference, field: Field) {
  await ref.update({
    [`${field}.status`]: 'none',
    [`${field}.updatedAt`]: FieldValue.serverTimestamp(),
  });
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  let authorized = !!cronSecret && bearer === cronSecret;
  if (!authorized) {
    const check = await verifyAdmin(req);
    if ('error' in check) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    authorized = true;
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  const corrections: { userId: string; field: Field; from: string; to: string; reason: string }[] = [];
  let checked = 0;

  try {
    const stripe = await getStripe();

    /** Verifies one user's record for one field against Stripe. Catches its
     *  own transient failures so a single bad lookup never aborts the page. */
    async function reconcileOne(doc: FirebaseFirestore.QueryDocumentSnapshot, field: Field) {
      checked++;
      const data = doc.data();
      const rec = data[field] as { stripeSubscriptionId?: string; expiresAt?: { toDate?: () => Date } } | undefined;
      const subId = rec?.stripeSubscriptionId;

      // No subscription id recorded at all — nothing to verify against.
      // Deliberately NOT revoked here: coaching and comped access can be
      // granted by an admin through /api/admin/set-membership without ever
      // touching Stripe, and silently cancelling those would be worse than
      // the problem this route exists to fix.
      if (!subId) return;

      let sub: Stripe.Subscription | null = null;
      try {
        sub = await stripe.subscriptions.retrieve(subId);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'resource_missing') {
          corrections.push({ userId: doc.id, field, from: 'active', to: 'none', reason: 'subscription no longer exists in Stripe' });
          if (!dryRun) {
            await revoke(doc.ref, field);
          }
          return;
        }
        console.error(`[reconcile] ${doc.id}/${field}: Stripe lookup failed`, err);
        return; // transient — leave it alone rather than revoke on an outage
      }

      const stripeSaysActive = ACTIVE_STATUSES.has(sub.status);
      if (!stripeSaysActive) {
        corrections.push({ userId: doc.id, field, from: 'active', to: 'none', reason: `Stripe status is "${sub.status}"` });
        if (!dryRun) {
          await revoke(doc.ref, field);
        }
        return;
      }

      // Still active in Stripe — refresh the stored period end so a missed
      // renewal webhook can't let a live subscription expire locally.
      const end = periodEnd(sub);
      const storedEnd = rec?.expiresAt?.toDate?.();
      if (end && (!storedEnd || Math.abs(storedEnd.getTime() - end.getTime()) > 60_000)) {
        corrections.push({
          userId: doc.id, field, from: storedEnd?.toISOString() ?? 'unset', to: end.toISOString(),
          reason: 'refreshed period end',
        });
        if (!dryRun) {
          // update(), not set(): see revoke() below for why that matters.
          await doc.ref.update({
            [`${field}.expiresAt`]: end,
            [`${field}.cancelAtPeriodEnd`]: sub.cancel_at_period_end,
            [`${field}.updatedAt`]: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    for (const field of FIELDS) {
      // Only users Firestore currently believes are paying can be wrongly
      // granted access, so that is the whole search space. Paged by document
      // id so memory stays flat however many subscribers there are, and each
      // page fans out to Stripe a few at a time — see PAGE_SIZE above.
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      for (;;) {
        let q = db.collection('users')
          .where(`${field}.status`, '==', 'active')
          .orderBy('__name__')
          .limit(PAGE_SIZE);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        if (snap.empty) break;
        cursor = snap.docs[snap.docs.length - 1];

        await mapWithConcurrency(snap.docs, STRIPE_CONCURRENCY, (doc) => reconcileOne(doc, field));

        if (snap.size < PAGE_SIZE) break;
      }
    }

    if (corrections.length > 0) {
      console.warn(`[reconcile] ${corrections.length} correction(s) across ${checked} record(s)`, corrections);
    } else {
      console.log(`[reconcile] ${checked} record(s) checked, all consistent`);
    }
    return NextResponse.json({ ok: true, dryRun, checked, corrections });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Reconciliation failed';
    console.error('[reconcile] Failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
