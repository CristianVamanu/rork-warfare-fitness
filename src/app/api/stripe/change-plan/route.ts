export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Switches an already-active member's subscription to a different membership
 * plan/billing term, in place — with Stripe prorating the difference.
 *
 * Stripe's own Customer Portal can only offer "Update subscription" between
 * plans that exist as permanent Product/Price objects; this app creates
 * every plan's price inline (price_data) at checkout time instead, so the
 * portal has no fixed catalog to show. This route is the actual upgrade
 * path — PlanUpgradeScreen (src/components/ui/PaywallGate.tsx) and the
 * Profile page's plan cards both call it directly instead of sending the
 * member through the portal for this.
 *
 * `preview: true` returns the prorated amount the switch would credit/charge
 * on the next invoice WITHOUT committing anything, so the UI can show the
 * user what they're agreeing to before they confirm.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';
import type { MembershipPlan } from '@/types';

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getDb(app);
}

// A subscription item's price_data needs an existing Product id, unlike a
// Checkout Session line item which accepts inline product_data.
//
// Uses a DETERMINISTIC Product id derived from the plan's own Firestore id
// (Stripe lets you set `id` explicitly on create) rather than letting Stripe
// generate a random one and caching it back to Firestore — a create-then-
// cache approach has a check-then-act race: two requests for the same plan
// switching concurrently (two different users, or a preview racing a
// commit) could both read "no cached id yet" before either write lands,
// each creating its own throwaway Product. A deterministic id sidesteps
// that entirely: creating with the same id twice just fails with a
// "resource already exists" error, which is treated as success (fetch and
// reuse) rather than retried into a duplicate.
function planProductId(planId: string): string {
  // Stripe product ids must be ASCII; plan ids are app-generated strings
  // (mplan_<timestamp>) that already satisfy this, but sanitize defensively.
  return `warfarefitness_plan_${planId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 255);
}

async function getOrCreatePlanProduct(stripe: Stripe, plan: MembershipPlan): Promise<string> {
  const id = planProductId(plan.id);
  try {
    const existing = await stripe.products.retrieve(id);
    if (existing.active) return existing.id;
  } catch {
    // Doesn't exist yet — fall through and create it.
  }
  try {
    const product = await stripe.products.create({ id, name: plan.name });
    return product.id;
  } catch (err) {
    // Lost a create race against a concurrent request for the same plan —
    // the other request's Product now exists under this same id; reuse it
    // rather than erroring the whole switch out.
    const existing = await stripe.products.retrieve(id).catch(() => null);
    if (existing) return existing.id;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await verifyAuthed(req);
  if ('error' in authCheck) return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
  const userId = authCheck.uid;

  try {
    const { planId, periodMonths, preview, prorationDate } = await req.json() as { planId: string; periodMonths?: 1 | 3 | 6 | 12; preview?: boolean; prorationDate?: number };
    if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });

    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

    const userSnap = await db.collection('users').doc(userId).get();
    const subId = userSnap.data()?.membership?.stripeSubscriptionId as string | undefined;
    if (!subId || userSnap.data()?.membership?.status !== 'active') {
      return NextResponse.json({ error: 'No active membership subscription found' }, { status: 400 });
    }

    const plansSnap = await db.collection('config').doc('membershipPlans').get();
    const plans = (plansSnap.data()?.plans as MembershipPlan[]) ?? [];
    const plan = plans.find((p) => p.id === planId && p.active);
    if (!plan) return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 });

    // Same server-derived price/cadence as plan-checkout — never trust a
    // client-supplied price for what gets billed.
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
    const subscription = await stripe.subscriptions.retrieve(subId);
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return NextResponse.json({ error: 'Subscription is not currently active' }, { status: 400 });
    }
    const item = subscription.items.data[0];
    if (!item) return NextResponse.json({ error: 'Subscription has no billed item to change' }, { status: 400 });

    if (subscription.metadata?.planId === planId && subscription.metadata?.periodMonths === String(months)) {
      return NextResponse.json({ error: 'You are already on this plan' }, { status: 400 });
    }

    const productId = await getOrCreatePlanProduct(stripe, plan);
    const priceData = {
      currency: (plan.currency ?? 'USD').toLowerCase(),
      unit_amount: Math.round(totalPrice * 100),
      recurring: { interval, interval_count: intervalCount },
      product: productId,
    };

    if (preview) {
      // Stripe's own docs for this call: pass the SAME proration_date back
      // into the real update below, or the two proration calculations can
      // diverge (proration is a function of exactly when it's calculated —
      // per-second — so time elapsed between preview and confirm, however
      // brief, could otherwise make the actually-billed amount different
      // from the number the user just confirmed).
      const previewProrationDate = Math.floor(Date.now() / 1000);
      const upcoming = await stripe.invoices.createPreview({
        subscription: subId,
        subscription_details: {
          items: [{ id: item.id, price_data: priceData }],
          proration_behavior: 'create_prorations',
          proration_date: previewProrationDate,
        },
      });
      // Only the proration adjustment lines, not the plan's full next-cycle
      // charge — that's the number that actually answers "what happens if I
      // click this right now", separate from the recurring price the member
      // is switching to (which the UI already shows on the plan card).
      const prorationCents = upcoming.lines.data
        .filter((line) => line.proration)
        .reduce((sum, line) => sum + line.amount, 0);
      return NextResponse.json({
        ok: true,
        prorationAmount: prorationCents / 100,
        currency: upcoming.currency,
        nextInvoiceDate: upcoming.period_end ? upcoming.period_end * 1000 : undefined,
        prorationDate: previewProrationDate,
      });
    }

    await stripe.subscriptions.update(subId, {
      items: [{ id: item.id, price_data: priceData }],
      // Prorates the switch onto the next invoice — standard "upgrade now,
      // pay the difference" behavior, matching what the Portal would do.
      proration_behavior: 'create_prorations',
      // Pins the proration math to the moment it was actually previewed and
      // confirmed, not "now" (which could be seconds or minutes later,
      // after the user reads the confirm dialog) — see the preview branch's
      // comment above.
      ...(prorationDate ? { proration_date: prorationDate } : {}),
      metadata: { userId, planId, planName: plan.name, periodMonths: String(months), kind: 'membership' },
    });

    // customer.subscription.updated (fired by the update above) syncs
    // membership.planId/planName in Firestore from this same metadata — no
    // need to write it here too, that would just race the webhook.
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to change plan';
    console.error('[Stripe] change-plan error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
