import crypto from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { sendEmail, verifyCodeEmailHtml } from '@/lib/email';

/**
 * Issues an email-confirmation code.
 *
 * Shared by verify-email/send and change-email. The second one matters: an
 * Admin-SDK email change invalidates the caller's ID token, so the client
 * cannot make an authenticated call afterwards to request its own code. The
 * server therefore has to send it as part of that same request, and both
 * routes must mint codes identically or the confirm step's email check fails.
 */

export const CODE_TTL_MS = 15 * 60 * 1000;

export function hashCode(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Stores a fresh hashed code and mails it. Returns false if delivery failed. */
export async function issueVerificationCode(
  db: Firestore,
  uid: string,
  email: string,
): Promise<boolean> {
  const code = crypto.randomInt(100000, 1000000).toString();

  // The address is stored alongside so confirm/ can reject a code minted for a
  // DIFFERENT address — which is exactly what a code issued moments before an
  // email change would be.
  await db.collection('emailVerifyCodes').doc(uid).set({
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
    email,
  });

  const cfgSnap = await db.collection('system').doc('config').get();
  const appName = (cfgSnap.data()?.appName as string) || 'Warfare Fitness';
  // logoUrl lives in the same config document appName came from, so the
  // email header gets the real logo for no extra read.
  const brand = { name: appName, logoUrl: (cfgSnap.data()?.logoUrl as string) || null };

  const sent = await sendEmail({
    to: email,
    subject: `Your ${appName} confirmation code`,
    html: verifyCodeEmailHtml(code, brand),
  });

  if (!sent) {
    console.error('[verificationCode] not delivered — check RESEND_API_KEY / RESEND_FROM_EMAIL');
  }
  return sent;
}
