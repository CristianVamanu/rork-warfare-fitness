/**
 * RevenueCat webhook: Google Play (and later App Store) subscriptions bought
 * in the app become the same `membership` record a Stripe purchase writes.
 *
 * Set in RevenueCat → Integrations → Webhooks:
 *   URL            https://warfarefitness.com/api/revenuecat/webhook
 *   Authorization  the value of REVENUECAT_WEBHOOK_AUTH
 * Env:
 *   REVENUECAT_WEBHOOK_AUTH  shared secret sent in the Authorization header
 *   REVENUECAT_ENTITLEMENT   entitlement id that means "member" (default: warfare_fitness_pro)
 *   REVENUECAT_PLAN_ID       membership plan id to record, so plan-based feature access matches
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { setSubscriptionStatus } from '@/lib/stripeMembership';
import { membershipChangeFor, type RevenueCatEvent } from '@/lib/revenuecat';
import { recordStoreEvent, type RcMoneyEvent } from '@/lib/finance/sync';
import { grantReferralReward, applyPendingPlayDays, revenueCatDeferrer, playMonthlyCents } from '@/lib/referralReward';
import { getStripe } from '@/lib/stripe';
import { recordPlayCommission, recordClawback } from '@/lib/partnersServer';
import { toMinor } from '@/lib/finance/money';

function authorized(header: string | null): boolean {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret || !header) return false;
  const a = Buffer.from(header.replace(/^Bearer\s+/i, '')), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req.headers.get('authorization'))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { event?: RevenueCatEvent };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const event = body.event;
  if (!event) return NextResponse.json({ error: 'no event' }, { status: 400 });

  // Google Play revenue ledger for the admin Finance screens (keyed by the
  // RevenueCat event id, so a retried delivery rewrites the same row).
  {
    const fapp = getAdminApp(); const fdb = fapp ? getAdminDb(fapp) : null;
    if (fdb) await recordStoreEvent(fdb, body.event as RcMoneyEvent);
  }

  const change = membershipChangeFor(event, process.env.REVENUECAT_ENTITLEMENT || 'warfare_fitness_pro');
  if (change.kind === 'ignore') return NextResponse.json({ ok: true, ignored: change.reason });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'server not configured' }, { status: 500 });
  const db = getAdminDb(app);
  if (!db) return NextResponse.json({ error: 'server not configured' }, { status: 500 });
  const user = await db.collection('users').doc(change.uid).get();
  // 200 so RevenueCat does not retry a purchase for an account that does not exist.
  if (!user.exists) return NextResponse.json({ ok: true, ignored: 'unknown user' });

  const planId = process.env.REVENUECAT_PLAN_ID || undefined;
  if (change.kind === 'grant') {
    await setSubscriptionStatus(db, change.uid, 'membership', 'active', change.expiresAt, planId, planId ? 'Google Play' : undefined,
      // A Play trial counts as the account's trial, so it cannot be followed
      // by a second free trial on the website.
      undefined, change.cancelAtPeriodEnd, event.type === 'INITIAL_PURCHASE' ? true : undefined, change.eventCreated, 'RevenueCat webhook');
  } else {
    // Only end a membership that Google Play is paying for. A member who
    // (also) pays by card on the website keeps their Stripe membership when
    // an old Play subscription expires.
    const m = user.data()?.membership as { source?: string; status?: string } | undefined;
    if (m?.status === 'active' && m.source !== 'google_play') {
      return NextResponse.json({ ok: true, ignored: 'membership is paid outside Google Play' });
    }
    await setSubscriptionStatus(db, change.uid, 'membership', 'none', undefined, undefined, undefined,
      undefined, undefined, undefined, change.eventCreated, 'RevenueCat webhook');
  }
  // With no plan id configured a Play membership is full access. Clear any
  // plan left behind by an earlier website membership, or a former member of
  // a restricted plan would buy on Play and still see that plan's locks.
  const stalePlan = change.kind === 'grant' && !planId ? { planId: FieldValue.delete(), planName: FieldValue.delete() } : {};
  await db.collection('users').doc(change.uid).set({ membership: { source: 'google_play', storeProductId: change.productId, ...stalePlan } }, { merge: true });
  // Referral reward: a paid Play payment counts toward the referred member's
  // second payment, exactly like a card payment. Never fails the webhook.
  if (change.kind === 'grant') {
    const e = event as RcMoneyEvent;
    const paid = (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') && e.period_type !== 'TRIAL' && (e.price_in_purchased_currency ?? 0) > 0;
    const play = revenueCatDeferrer(process.env.REVENUECAT_SECRET_KEY);
    try {
      if (paid && event.id) {
        const stripe = await getStripe();
        await grantReferralReward(db, stripe, {
          memberUid: change.uid, paymentId: `play-${e.transaction_id || event.id}`,
          cents: playMonthlyCents(e.price_in_purchased_currency, e.purchased_at_ms, e.expiration_at_ms),
          currency: (e.currency || 'usd').toLowerCase(), play,
        });
      }
      await applyPendingPlayDays(db, play, change.uid, change.productId);
    } catch (err) { console.error('[RevenueCat webhook] referral reward failed', err); }
  }
  // Partner commission on Google Play payments, like card payments get in the
  // Stripe webhook. Never fails the webhook.
  {
    const e = event as RcMoneyEvent & { cancel_reason?: string | null };
    const txn = e.transaction_id || '';
    const cur = (e.currency || 'usd').toLowerCase();
    try {
      if (change.kind === 'grant' && (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') && e.period_type !== 'TRIAL'
          && (e.price_in_purchased_currency ?? 0) > 0 && txn) {
        await recordPlayCommission(db, { memberUid: change.uid, transactionId: txn, amountPaidCents: toMinor(e.price_in_purchased_currency as number, cur), currency: cur, productId: change.productId });
      }
      // RevenueCat reports a Google Play refund as a cancellation with reason
      // CUSTOMER_SUPPORT. Take the commission back, as a card refund does.
      if (event.type === 'CANCELLATION' && e.cancel_reason === 'CUSTOMER_SUPPORT' && txn && event.id) {
        const price = Math.abs(e.price_in_purchased_currency ?? 0);
        await recordClawback(db, { invoiceId: `play-${txn}`, refundedCents: price > 0 ? toMinor(price, cur) : Number.MAX_SAFE_INTEGER, eventId: event.id, reason: 'refund' });
      }
    } catch (err) { console.error('[RevenueCat webhook] partner commission failed', err); }
  }
  return NextResponse.json({ ok: true });
}
