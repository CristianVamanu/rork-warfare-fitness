export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Corrects a mistyped address on an account that has not been verified yet.
 *
 * Without this the app had a genuine dead end: a typo at signup meant the
 * confirmation code went to an inbox the member does not own, and there was no
 * screen anywhere in the app to change an email address. The account could
 * never be verified, and since verification gates trial access, it could never
 * be used either — with no route out short of an admin editing Firebase by
 * hand.
 *
 * Deliberately restricted to UNVERIFIED accounts. Changing the address on a
 * verified one is a different and far more dangerous operation — it is how a
 * hijacked session takes permanent ownership of an account — and belongs
 * behind re-authentication plus a notice to the OLD address. That flow does
 * not exist yet, and this route must not become a back door into it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe';
import { rateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const { uid } = check;

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  const db = getAdminDb(app);
  const auth = getAuth(app);

  try {
    const { email } = await req.json().catch(() => ({})) as { email?: string };
    const next = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!next || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const user = await auth.getUser(uid);

    // The load-bearing check. A verified account changing its address is
    // account takeover if the session is stolen; this route only ever repairs
    // an address that was never confirmed in the first place.
    if (user.emailVerified) {
      return NextResponse.json(
        { error: 'This address is already confirmed. Contact support to change it.' },
        { status: 403 },
      );
    }

    if (next === user.email?.toLowerCase()) {
      return NextResponse.json({ error: 'That is already your email address.' }, { status: 400 });
    }

    // Bounded per account: without a limit this is a free way to enumerate
    // which addresses already have accounts, one attempt at a time.
    const limit = await rateLimit({ scope: 'change-unverified-email', key: uid, windowMs: 60 * 60_000, max: 5 });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many changes', retryAfter: limit.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    try {
      await auth.updateUser(uid, { email: next, emailVerified: false });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-exists') {
        // Deliberately the same wording a real conflict would produce, and no
        // more: confirming that an address is registered is exactly what the
        // rate limit above exists to make expensive.
        return NextResponse.json({ error: 'That address is not available.' }, { status: 409 });
      }
      if (code === 'auth/invalid-email') {
        return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
      }
      throw err;
    }

    // Firestore holds its own copy, read by the admin client list, support
    // tickets and every outbound email. Leaving it stale would mean staff
    // seeing one address while Firebase Auth sends codes to another.
    await db.collection('users').doc(uid).set({ email: next }, { merge: true });

    // Any code already issued was minted for the OLD address — confirm/route
    // rejects it on the email check, but deleting it here means the member
    // never sees a confusing "your email changed" error for a code they were
    // never going to receive.
    await db.collection('emailVerifyCodes').doc(uid).delete().catch(() => {});

    // Keep Stripe in step if this account already has a billing identity, so
    // receipts and dunning mail follow the corrected address. Best-effort:
    // this must never fail an email correction.
    const customerId = (await db.collection('users').doc(uid).get()).data()?.stripeCustomerId as string | undefined;
    if (customerId) {
      try {
        const stripe = await getStripe();
        await stripe.customers.update(customerId, { email: next });
      } catch (err) {
        console.error('[change-email] Stripe customer email not updated:', err);
      }
    }

    console.log(`[change-email] ${uid} corrected unverified address`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[change-email] Error:', err);
    return NextResponse.json({ error: 'Could not change your email address' }, { status: 500 });
  }
}
