export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Changes 2FA enrollment/notification-email — moved off a plain client-side
 * Firestore write (updateUserDoc) because twoFactorEnabled/twoFactorEmail
 * are exactly the fields a hijacked session (XSS, stolen token, unlocked
 * device) would want to touch: turning 2FA off, or redirecting future codes
 * to an attacker-controlled inbox, with no password required either way.
 * firestore.rules now blocks these two fields from a direct client update
 * (see the users/{userId} update rule's restricted-fields list); this route
 * is the only path left, and it always notifies the account's real login
 * email of the change — never the new twoFactorEmail itself, which could be
 * the attacker's own address.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthedNotTfaPending } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, twoFactorSettingsChangedEmailHtml } from '@/lib/email';

export async function POST(req: NextRequest) {
  const check = await verifyAuthedNotTfaPending(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const body = await req.json().catch(() => ({})) as { enabled?: boolean; email?: string | null };
  const touchesEnabled = typeof body.enabled === 'boolean';
  const touchesEmail = 'email' in body;
  if (!touchesEnabled && !touchesEmail) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  if (touchesEmail && body.email && !/^\S+@\S+\.\S+$/.test(body.email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};
  let changeDescription = '';
  if (touchesEnabled) {
    update.twoFactorEnabled = body.enabled;
    changeDescription = body.enabled ? 'two-factor authentication was turned on' : 'two-factor authentication was turned off';
  }
  if (touchesEmail) {
    update.twoFactorEmail = body.email || null;
    changeDescription = changeDescription
      ? `${changeDescription}, and its notification email was changed`
      : 'the two-factor authentication notification email was changed';
  }

  const userRef = db.collection('users').doc(check.uid);
  const userSnap = await userRef.get();
  const user = userSnap.data();

  await userRef.update(update);

  // A "remember this device" token from before 2FA was toggled shouldn't
  // outlive the toggle — otherwise disabling then re-enabling 2FA still
  // lets an old trusted-device cookie skip the code entirely for up to
  // its original 30-day life, regardless of the fresh enable/disable intent.
  if (touchesEnabled) {
    const devicesSnap = await db.collection('trustedDevices').doc(check.uid).collection('devices').get();
    if (!devicesSnap.empty) {
      const batch = db.batch();
      devicesSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  if (user?.email) {
    const cfgSnap = await db.collection('system').doc('config').get();
    const appName = (cfgSnap.data()?.appName as string) || 'Warfare Fitness';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
    await sendEmail({
      to: user.email,
      subject: `Security setting changed on ${appName}`,
      html: twoFactorSettingsChangedEmailHtml(user.displayName?.split(' ')[0] || 'there', changeDescription, appName, appUrl),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
