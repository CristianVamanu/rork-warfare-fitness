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
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { setSubscriptionStatus } from '@/lib/stripeMembership';
import { membershipChangeFor, type RevenueCatEvent } from '@/lib/revenuecat';

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
      undefined, change.cancelAtPeriodEnd, undefined, change.eventCreated, 'RevenueCat webhook');
  } else {
    // Only end a membership that Google Play is paying for. A member who
    // (also) pays by card on the website keeps their Stripe membership when
    // an old Play subscription expires.
    const m = user.data()?.membership as { source?: string; stripeSubscriptionId?: string; status?: string } | undefined;
    if (m?.status === 'active' && (m.source !== 'google_play' || m.stripeSubscriptionId)) {
      return NextResponse.json({ ok: true, ignored: 'membership is paid outside Google Play' });
    }
    await setSubscriptionStatus(db, change.uid, 'membership', 'none', undefined, undefined, undefined,
      undefined, undefined, undefined, change.eventCreated, 'RevenueCat webhook');
  }
  await db.collection('users').doc(change.uid).set({ membership: { source: 'google_play', storeProductId: change.productId } }, { merge: true });
  return NextResponse.json({ ok: true });
}
