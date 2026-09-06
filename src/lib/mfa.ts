import {
  multiFactor,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User,
  type MultiFactorError,
  type MultiFactorInfo,
  type MultiFactorResolver,
  type TotpSecret,
} from 'firebase/auth';
import { auth } from './firebase';

/**
 * TOTP multi-factor authentication via Firebase Authentication (Identity
 * Platform). Works with Google Authenticator, Authy, 1Password, or any
 * TOTP app.
 *
 * This replaces the custom email-code 2FA (twoFactorEnabled +
 * twoFactorPendingSince + a tfaPending custom claim). That design had a
 * hole nothing in the app could close: the flag was enforced by the app's
 * own routes and rules, but the Identity Toolkit REST API hands a full ID
 * token to anyone with the password, and only the web UI ever asked for a
 * code. Native MFA is enforced by Firebase Auth itself at token issuance —
 * a password alone never yields a usable token for an enrolled account, on
 * any client, via any API.
 *
 * Requires the Firebase project to be upgraded to Identity Platform and the
 * TOTP provider enabled (see scripts/enable-totp-mfa.mjs). Until then,
 * getSession() throws auth/operation-not-allowed and the UI reports it.
 */

export const TOTP_FACTOR_ID = TotpMultiFactorGenerator.FACTOR_ID;

/** Enrolled TOTP factors on the current user (usually 0 or 1). */
export function enrolledTotpFactors(user: User): MultiFactorInfo[] {
  return multiFactor(user).enrolledFactors.filter((f) => f.factorId === TOTP_FACTOR_ID);
}

export function hasTotp(user: User | null | undefined): boolean {
  return !!user && enrolledTotpFactors(user).length > 0;
}

/**
 * Firebase requires a recent sign-in for enrolment and unenrolment. Rather
 * than bouncing the user out to the login page, re-authenticate inline with
 * the password they just typed into the modal.
 */
export async function reauthenticate(user: User, password: string): Promise<void> {
  if (!user.email) throw new Error('Account has no email address');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}

export interface TotpEnrolment {
  secret: TotpSecret;
  /** otpauth:// URI — render as a QR code for the authenticator app. */
  otpauthUri: string;
  /** The base32 secret key, for manual entry when the QR can't be scanned. */
  secretKey: string;
}

/** Step 1: generate a secret and the QR payload. Call after reauthenticate(). */
export async function startTotpEnrolment(user: User, appName: string): Promise<TotpEnrolment> {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const account = user.email ?? user.uid;
  return {
    secret,
    otpauthUri: secret.generateQrCodeUrl(account, appName),
    secretKey: secret.secretKey,
  };
}

/** Step 2: confirm with the 6-digit code the app shows. */
export async function finishTotpEnrolment(user: User, enrolment: TotpEnrolment, code: string, displayName = 'Authenticator app'): Promise<void> {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(enrolment.secret, code.replace(/\s+/g, ''));
  await multiFactor(user).enroll(assertion, displayName);
}

/** Remove every enrolled TOTP factor. Call after reauthenticate(). */
export async function unenrolTotp(user: User): Promise<void> {
  for (const factor of enrolledTotpFactors(user)) {
    await multiFactor(user).unenroll(factor);
  }
}

// ── Sign-in challenge ───────────────────────────────────────────────────────

export function isMfaRequiredError(err: unknown): err is MultiFactorError {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === 'auth/multi-factor-auth-required';
}

export interface TotpChallenge {
  resolver: MultiFactorResolver;
  hint: MultiFactorInfo;
}

/** Build the challenge from the sign-in error; null if no TOTP factor is enrolled. */
export function totpChallengeFrom(err: MultiFactorError): TotpChallenge | null {
  const resolver = getMultiFactorResolver(auth, err);
  const hint = resolver.hints.find((h) => h.factorId === TOTP_FACTOR_ID);
  return hint ? { resolver, hint } : null;
}

/** Complete sign-in with the 6-digit code. Resolves to the signed-in user. */
export async function resolveTotpSignIn(challenge: TotpChallenge, code: string): Promise<User> {
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(challenge.hint.uid, code.replace(/\s+/g, ''));
  const cred = await challenge.resolver.resolveSignIn(assertion);
  return cred.user;
}

/** Human-readable messages for the errors these flows actually produce. */
export function mfaErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-verification-code': return 'That code is not right. Check your authenticator app and try again.';
    case 'auth/totp-challenge-timeout': return 'The code expired. Enter the current one from your app.';
    case 'auth/requires-recent-login': return 'Please confirm your password to continue.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect password.';
    case 'auth/operation-not-allowed': return 'Authenticator apps are not enabled for this project yet. Enable TOTP MFA in Firebase (Identity Platform) first.';
    case 'auth/maximum-second-factor-count-exceeded': return 'This account already has the maximum number of authenticators.';
    case 'auth/unsupported-first-factor': return 'This sign-in method cannot be used with an authenticator app.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a few minutes and try again.';
    default: return (err as { message?: string })?.message || 'Something went wrong. Try again.';
  }
}
