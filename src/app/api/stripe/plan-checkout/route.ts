export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Instant self-serve checkout for a membership plan — as opposed to
 * coaching-checkout, which is triggered manually after a 1:1 coaching
 * application is reviewed and approved. Structurally identical to
 * coaching-checkout (subscription mode, same metadata shape, same discount
 * logic) so the existing Stripe webhook handles both without any changes:
 * it already reads planId/planName generically off whichever checkout
 * session or subscription created it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import type { MembershipPlan } from '@/types';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getDb(app);
}

export async function POST(req: NextRequest) {
  // Verifies the caller's own login token so a checkout session can only
  // ever be started for the person actually making the request — previously
  // userId came straight from the request body with no check that it
  // matched who was logged in.
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const userId = authCheck.uid;

  try {
    const { userEmail, planId, periodMonths } = await req.json() as { userEmail: string; planId: string; periodMonths?: 1 | 3 | 6 | 12 };
    if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });

    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

    const snap = await db.collection('config').doc('membershipPlans').get();
    const plans = (snap.data()?.plans as MembershipPlan[]) ?? [];
    const plan = plans.find((p) => p.id === planId && p.active);
    if (!plan) return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 });

    // Reject a second checkout attempt while one is already active — with
    // nothing checking for an existing subscription, a double-click or a
    // retry on a slow connection could each create their own Stripe
    // Checkout Session, and if the user completed both, two separate
    // subscriptions would get created for the same plan.
    const userSnap = await db.collection('users').doc(userId).get();
    if (userSnap.data()?.membership?.status === 'active') {
      return NextResponse.json({ error: 'You already have an active membership.' }, { status: 400 });
    }

    // Price and Stripe billing cadence are both derived server-side from the
    // requested term, never trusted from the client — a client could
    // otherwise request periodMonths: 12 while still being charged the
    // 1-month price, or vice versa.
    const months = periodMonths ?? 1;
    const PERIOD_PRICE_FIELD: Record<number, keyof MembershipPlan | null> = {
      1: null, 3: 'price3mo', 6: 'price6mo', 12: 'price12mo',
    };
    const priceField = PERIOD_PRICE_FIELD[months];
    const totalPrice = priceField ? (plan[priceField] as number | undefined) : plan.priceMonthly;
    if (!totalPrice || totalPrice <= 0) return NextResponse.json({ error: 'That billing term is not available for this plan' }, { status: 400 });
    const interval: 'month' | 'year' = months === 12 ? 'year' : 'month';
    const intervalCount = months === 12 ? 1 : months;

    const stripe = await getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';

    // Reuse the same site-wide time-limited discount as the rest of checkout
    let discounts: { coupon: string }[] | undefined;
    let trialFeeDiscountMultiplier: number | undefined;
    const membershipCfgSnap = await db.collection('config').doc('membership').get();
    const membershipCfg = membershipCfgSnap.data() ?? {};
    const discountPercent = Number(membershipCfg.discountPercent ?? 0);
    const discountExpiresAt = membershipCfg.discountExpiresAt ? new Date(membershipCfg.discountExpiresAt as string) : null;
    if (discountPercent > 0 && discountExpiresAt && discountExpiresAt.getTime() > Date.now()) {
      const willChargeTrialFeeFirst = membershipCfg.paidTrialEnabled === true
        && Number(membershipCfg.trialDays ?? 0) > 0
        && !userSnap.data()?.trialUsedAt;
      if (willChargeTrialFeeFirst) {
        // Checkout Sessions can only apply a coupon session-wide, never to
        // one specific line item, and a subscription-level coupon can only
        // target the FIRST invoice ('once') or a fixed number of calendar
        // MONTHS from attachment ('repeating'/duration_in_months) — neither
        // lines up with "discount the plan's real first charge" here. The
        // trial fee's one-time invoice fires immediately at checkout, so a
        // 'once' coupon lands entirely there instead of on the plan price.
        // A previous fix tried `duration_in_months: 2` to still be attached
        // when the real charge lands — but that counts from attachment
        // (checkout time), not from the real invoice, so for monthly plans
        // it also silently discounted the SECOND real payment too (an extra
        // cycle of over-discounting nobody asked for). There's no coupon
        // shape that reaches exactly the second invoice and no other, so
        // instead the discount is applied directly to the trial fee itself
        // — the one charge Stripe guarantees fires exactly once, right now.
        // The plan's ongoing price is left at full rate under a paid trial.
        trialFeeDiscountMultiplier = 1 - discountPercent / 100;
      } else {
        const coupon = await stripe.coupons.create({ percent_off: discountPercent, duration: 'once' });
        discounts = [{ coupon: coupon.id }];
      }
    }

    const trialDays = Number(membershipCfg.trialDays ?? 0);
    const paidTrialEnabled = membershipCfg.paidTrialEnabled === true;
    // Cancel-then-resubscribe would otherwise get the discounted trial fee
    // (or another free ride) every single time — set once, by the webhook,
    // the first time either kind of trial is actually used (see
    // checkout.session.completed below).
    const alreadyUsedTrial = !!userSnap.data()?.trialUsedAt;

    // A trial (paid or free) is what a throwaway address farms. A verified
    // address is required to START one; a returning member paying full price
    // (alreadyUsedTrial) is never blocked here — nobody farms full price.
    if (trialDays > 0 && !alreadyUsedTrial && !authCheck.emailVerified) {
      return NextResponse.json(
        { error: 'Verify your email address to start your trial — check your inbox for the link, then try again.', code: 'EMAIL_NOT_VERIFIED' },
        { status: 403 },
      );
    }

    let trialPeriodDays: number | undefined;
    // A one-time charge alongside the recurring price — Stripe Checkout
    // supports mixing a one-time price_data item with a recurring one in
    // 'subscription' mode; the one-time item invoices immediately at
    // checkout regardless of the recurring item's own trial_period_days.
    // This is the actual MadMuscles mechanic: pay the small trial fee now,
    // the real plan price only starts billing after trialDays.
    let trialFeeLineItem: { quantity: number; price_data: { currency: string; unit_amount: number; product_data: { name: string } } } | undefined;

    if (paidTrialEnabled && trialDays > 0 && !alreadyUsedTrial) {
      trialPeriodDays = trialDays;
      const baseTrialPriceCents = Math.max(0, Math.round(Number(membershipCfg.trialPriceCents ?? 100)));
      const trialPriceCents = trialFeeDiscountMultiplier !== undefined
        ? Math.round(baseTrialPriceCents * trialFeeDiscountMultiplier)
        : baseTrialPriceCents;
      trialFeeLineItem = {
        quantity: 1,
        price_data: {
          currency: (plan.currency ?? 'USD').toLowerCase(),
          unit_amount: trialPriceCents,
          // Deliberately does NOT call this "N-day trial" — Stripe's own
          // Checkout UI already puts an auto-generated "N days free" badge
          // under the RECURRING line item below (driven by
          // subscription_data.trial_period_days, not any text we control),
          // since that item's own charge genuinely doesn't start for N
          // days. Naming this one-time item "{plan} — N-day trial" too put
          // two lines on the same receipt both claiming to BE the trial —
          // one for free, one for $1 — reading as a direct contradiction
          // even though both statements are true (a one-time access fee is
          // due today; the plan itself is free for N days). Calling this
          // one what it actually is removes the collision.
          product_data: { name: `${plan.name} — Trial Access Fee (one-time)` },
        },
      };
    } else if (!paidTrialEnabled && trialDays > 0 && !alreadyUsedTrial) {
      // Free, no-card trial: tell Stripe to defer the first charge until
      // the app-level free-trial window (anchored to account creation, not
      // checkout time) actually ends — otherwise "subscribing" during the
      // free trial would charge the card immediately.
      //
      // Uses trial_period_days (relative, computed here) rather than an
      // absolute trial_end timestamp. The trial's real anchor is still
      // account creation — trialEndMs below is computed exactly the same
      // way either way — but handing Stripe an absolute timestamp that's a
      // few minutes (or hours) short of a full N*24h from now made its own
      // checkout-page day count round DOWN, e.g. a user who finished
      // onboarding and landed on checkout 10 minutes after signup saw "6
      // days free trial" advertised for what both the promo copy and the
      // backend intended to be a full 7. Ceiling the remaining time into
      // whole days ourselves before calling Stripe means the number we ask
      // for is exactly the number Stripe displays and honors.
      const createdAtRaw = userSnap.data()?.createdAt as { toDate?: () => Date } | string | undefined;
      const createdAt = typeof createdAtRaw === 'object' && createdAtRaw?.toDate ? createdAtRaw.toDate() : (createdAtRaw ? new Date(createdAtRaw as string) : null);
      if (createdAt) {
        const trialEndMs = createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000;
        const remainingMs = trialEndMs - Date.now();
        if (remainingMs > 60 * 1000) {
          trialPeriodDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
        }
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: userEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (plan.currency ?? 'USD').toLowerCase(),
            unit_amount: Math.round(totalPrice * 100),
            recurring: { interval, interval_count: intervalCount },
            product_data: { name: months === 1 ? plan.name : `${plan.name} (${months}-month term)` },
          },
        },
        ...(trialFeeLineItem ? [trialFeeLineItem] : []),
      ],
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      // Stated explicitly rather than left to Stripe's default, because on a
      // free trial the amount due today is $0 and a card-less signup is the
      // difference between a trial that converts on day 8 and one that
      // silently expires into an unpayable invoice. Requiring the card up
      // front is also what makes the trial self-converting: nothing for the
      // member to come back and do.
      payment_method_collection: 'always',
      subscription_data: {
        ...(trialPeriodDays ? { trial_period_days: trialPeriodDays } : {}),
        metadata: { userId, planId, planName: plan.name, periodMonths: String(months), kind: 'membership' },
      },
      metadata: {
        userId, planId, planName: plan.name, periodMonths: String(months), kind: 'membership',
        ...(trialPeriodDays ? { trialUsed: 'true' } : {}),
      },
      success_url: `${appUrl}/profile?subscribed=1`,
      cancel_url: `${appUrl}/profile`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create checkout session';
    console.error('[Stripe] plan-checkout error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
