export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST — start or resume Stripe Connect onboarding for the signed-in partner.
 * Returns the hosted onboarding URL. Express accounts: Stripe collects the
 * identity and bank details and issues the tax forms; the app only ever
 * holds the account id. GET — refreshes and returns the account's readiness.
 *
 * Both tolerate a Stripe account without Connect enabled: the error is
 * returned as a message, the partner record is untouched, and the admin
 * can pay manually in the meantime.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { getStripe } from '@/lib/stripe';
import { getPartner } from '@/lib/partnersServer';

export async function POST(req: NextRequest) {
  const check = await verifyAuthedNotTfaPending(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const partner = await getPartner(db, check.uid);
  if (!partner || partner.status !== 'active') return NextResponse.json({ error: 'Only active partners can connect a payout account.' }, { status: 403 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
  try {
    const stripe = await getStripe();
    let accountId = partner.connectAccountId ?? null;
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: 'express',
        email: partner.profile?.email || undefined,
        capabilities: { transfers: { requested: true } },
        metadata: { partnerId: partner.uid, partnerCode: partner.code },
        business_profile: { product_description: 'Affiliate commissions' },
      });
      accountId = acct.id;
      await db.collection('partners').doc(partner.uid).set({ connectAccountId: accountId, connectReady: false, connectCreatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const link = await stripe.accountLinks.create({
      account: accountId, type: 'account_onboarding',
      refresh_url: `${appUrl}/partner?connect=refresh`, return_url: `${appUrl}/partner?connect=return`,
    });
    return NextResponse.json({ url: link.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[partner connect]', msg);
    return NextResponse.json({ error: /connect/i.test(msg) ? 'Stripe Connect is not enabled on this account yet. Payouts will be made manually until it is.' : msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const check = await verifyAuthedNotTfaPending(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const partner = await getPartner(db, check.uid);
  if (!partner?.connectAccountId) return NextResponse.json({ connected: false, ready: false });
  try {
    const stripe = await getStripe();
    const acct = await stripe.accounts.retrieve(partner.connectAccountId);
    const ready = acct.payouts_enabled === true && (acct.capabilities?.transfers === 'active');
    if (ready !== !!partner.connectReady) await db.collection('partners').doc(partner.uid).set({ connectReady: ready }, { merge: true });
    return NextResponse.json({ connected: true, ready, requirements: acct.requirements?.currently_due ?? [] });
  } catch (err) {
    return NextResponse.json({ connected: true, ready: !!partner.connectReady, error: err instanceof Error ? err.message : String(err) });
  }
}
