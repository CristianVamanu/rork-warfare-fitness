export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Discount codes, managed from the admin panel instead of the Stripe dashboard.
 *
 * Stripe stays the system of record. Nothing is mirrored into Firestore, so
 * there is no second copy to drift: a code created here is the same object a
 * code created in the dashboard is, and either can be managed from either
 * place. Checkout already offers a code box, so nothing about this changes how
 * a purchase works — it only creates the codes that box accepts.
 *
 * A Stripe discount is two objects. The coupon holds the amount, how long it
 * lasts, and what it may be applied to; the promotion code is the string
 * someone types. They are created together here because separately is a
 * footgun: a coupon with no code is invisible, and the pairing is what the
 * admin actually means by "a code".
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getStripe } from '@/lib/stripe';
import { getAdminApp, getAdminDb as getDb } from '@/lib/firebase-admin';
import {
  planProductId, coachingProductId,
  getOrCreatePlanProduct, getOrCreateCoachingProduct,
} from '@/lib/stripeProducts';
import type { MembershipPlan, CoachingPlan } from '@/types';

/** Stripe accepts more than this; this is what a person can read out loud. */
const CODE_PATTERN = /^[A-Z0-9]{3,24}$/;

function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getDb(app);
}

interface Sellable { key: string; name: string; kind: 'membership' | 'coaching'; productId: string }

/**
 * Everything a code can be limited to, with the Stripe product id each one
 * resolves to. The ids are derived, not looked up, so this says what a
 * product WOULD be even for a plan nobody has bought yet.
 */
async function listSellables(): Promise<Sellable[]> {
  const db = getAdminDb();
  if (!db) return [];
  const [mSnap, cSnap] = await Promise.all([
    db.collection('config').doc('membershipPlans').get(),
    db.collection('config').doc('coachingPlans').get(),
  ]);
  const membership = ((mSnap.data()?.plans as MembershipPlan[]) ?? [])
    .filter((p) => p.active)
    .map((p): Sellable => ({ key: `membership:${p.id}`, name: p.name, kind: 'membership', productId: planProductId(p.id) }));
  const coaching = ((cSnap.data()?.plans as CoachingPlan[]) ?? [])
    .filter((p) => p.active)
    .map((p): Sellable => ({ key: `coaching:${p.id}`, name: p.name, kind: 'coaching', productId: coachingProductId(p.id) }));
  return [...membership, ...coaching];
}

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    const stripe = await getStripe();
    const [list, sellables] = await Promise.all([
      stripe.promotionCodes.list({ limit: 100, expand: ['data.coupon'] }),
      listSellables(),
    ]);

    // Product ids are matched against the ones our own plans derive, rather
    // than parsed back out of the string. Sanitising a plan id into a Stripe
    // id is not perfectly reversible, and a wrong guess here would mislabel
    // which plans a live discount covers.
    const nameByProduct = new Map(sellables.map((s) => [s.productId, s.name]));

    return NextResponse.json({
      sellables: sellables.map(({ key, name, kind }) => ({ key, name, kind })),
      codes: list.data.map((p) => {
        const coupon = p.coupon;
        const products = coupon?.applies_to?.products ?? [];
        return {
          id: p.id,
          code: p.code,
          active: p.active,
          timesRedeemed: p.times_redeemed,
          maxRedemptions: p.max_redemptions ?? null,
          expiresAt: p.expires_at ? new Date(p.expires_at * 1000).toISOString() : null,
          percentOff: coupon?.percent_off ?? null,
          duration: coupon?.duration ?? null,
          durationInMonths: coupon?.duration_in_months ?? null,
          // Empty means the code is not restricted and applies to everything.
          appliesTo: products.map((id) => nameByProduct.get(id) ?? 'A plan that no longer exists'),
          createdAt: new Date(p.created * 1000).toISOString(),
        };
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not load codes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    const body = await req.json();
    const code = String(body.code ?? '').trim().toUpperCase();
    const percentOff = Number(body.percentOff);
    const duration = String(body.duration ?? 'forever');
    const durationInMonths = body.durationInMonths ? Number(body.durationInMonths) : undefined;
    const maxRedemptions = body.maxRedemptions ? Number(body.maxRedemptions) : undefined;
    const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : undefined;
    const planKeys: string[] = Array.isArray(body.planKeys) ? body.planKeys.map(String) : [];

    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json({ error: 'Code must be 3 to 24 characters, letters and numbers only.' }, { status: 400 });
    }
    if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 100) {
      return NextResponse.json({ error: 'Discount must be between 1% and 100%.' }, { status: 400 });
    }
    if (!['forever', 'once', 'repeating'].includes(duration)) {
      return NextResponse.json({ error: 'Unknown duration.' }, { status: 400 });
    }
    if (duration === 'repeating' && (!durationInMonths || durationInMonths < 1 || durationInMonths > 36)) {
      return NextResponse.json({ error: 'Repeating codes need a length between 1 and 36 months.' }, { status: 400 });
    }
    if (maxRedemptions !== undefined && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
      return NextResponse.json({ error: 'Uses must be a whole number of at least 1.' }, { status: 400 });
    }
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
      return NextResponse.json({ error: 'The expiry date must be in the future.' }, { status: 400 });
    }

    const stripe = await getStripe();

    // Stripe answers 400 on a duplicate code, but the message names objects an
    // admin has never heard of. Checking first turns it into a sentence.
    const existing = await stripe.promotionCodes.list({ code, limit: 1 });
    if (existing.data.length > 0) {
      return NextResponse.json({ error: `${code} already exists.` }, { status: 409 });
    }

    // Restricting to specific plans means naming their Stripe products, and a
    // coupon cannot name a product that does not exist yet. The products are
    // therefore created here rather than waiting for someone to buy the plan.
    // Note what is deliberately absent: the trial fee's product. A restricted
    // code discounts the plan and leaves the one-off access fee alone, which
    // is the difference between a quarter off thirty dollars and a quarter off
    // one dollar.
    let appliesTo: string[] | undefined;
    if (planKeys.length > 0) {
      const db = getAdminDb();
      if (!db) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
      const [mSnap, cSnap] = await Promise.all([
        db.collection('config').doc('membershipPlans').get(),
        db.collection('config').doc('coachingPlans').get(),
      ]);
      const membershipPlans = (mSnap.data()?.plans as MembershipPlan[]) ?? [];
      const coachingPlans = (cSnap.data()?.plans as CoachingPlan[]) ?? [];

      const products: string[] = [];
      for (const key of planKeys) {
        const [kind, id] = key.split(':');
        if (kind === 'membership') {
          const plan = membershipPlans.find((p) => p.id === id);
          if (plan) products.push(await getOrCreatePlanProduct(stripe, plan));
        } else if (kind === 'coaching') {
          const plan = coachingPlans.find((p) => p.id === id);
          if (plan) products.push(await getOrCreateCoachingProduct(stripe, plan));
        }
      }
      if (products.length === 0) {
        return NextResponse.json({ error: 'None of those plans could be found.' }, { status: 400 });
      }
      appliesTo = products;
    }

    const coupon = await stripe.coupons.create({
      percent_off: percentOff,
      duration: duration as 'forever' | 'once' | 'repeating',
      ...(duration === 'repeating' ? { duration_in_months: durationInMonths } : {}),
      ...(appliesTo ? { applies_to: { products: appliesTo } } : {}),
      name: code,
    });

    const promo = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code,
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
      ...(expiresAt ? { expires_at: Math.floor(expiresAt.getTime() / 1000) } : {}),
    });

    return NextResponse.json({ id: promo.id, code: promo.code });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not create the code' }, { status: 500 });
  }
}

/**
 * Turns a code off, or back on. Stripe has no delete for promotion codes, by
 * design: a redeemed code is part of a customer's billing history and cannot
 * be made never to have existed. Deactivating stops new redemptions and leaves
 * anyone already on the discount exactly where they are.
 */
export async function PATCH(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    const { id, active } = await req.json();
    if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const stripe = await getStripe();
    const updated = await stripe.promotionCodes.update(id, { active: active === true });
    return NextResponse.json({ id: updated.id, active: updated.active });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not update the code' }, { status: 500 });
  }
}
