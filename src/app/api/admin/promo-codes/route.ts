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
 * A Stripe discount is two objects. The coupon holds the amount and how long
 * it lasts; the promotion code is the string someone types. They are created
 * together here because separately is a footgun: a coupon with no code is
 * invisible, and the pairing is what the admin actually means by "a code".
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getStripe } from '@/lib/stripe';

/** Stripe accepts more than this; this is what a person can read out loud. */
const CODE_PATTERN = /^[A-Z0-9]{3,24}$/;

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    const stripe = await getStripe();
    const list = await stripe.promotionCodes.list({ limit: 100, expand: ['data.coupon'] });
    return NextResponse.json({
      codes: list.data.map((p) => {
        const coupon = p.coupon;
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

    const coupon = await stripe.coupons.create({
      percent_off: percentOff,
      duration: duration as 'forever' | 'once' | 'repeating',
      ...(duration === 'repeating' ? { duration_in_months: durationInMonths } : {}),
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
