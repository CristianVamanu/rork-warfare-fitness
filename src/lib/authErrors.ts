/**
 * One place that turns a Firebase Auth error into a sentence a person can
 * act on. The sign-in and sign-up forms used to put the raw
 * `auth/invalid-credential: Firebase: Error (auth/invalid-credential).` on
 * screen — accurate, and useless to someone who just mistyped a password.
 *
 * The raw code and message still go to console.error at every call site,
 * so nothing is hidden from whoever is debugging; only the toast changes.
 * Codes not listed here fall through to the raw text rather than a vague
 * "something went wrong", for the same reason.
 *
 * Note on `auth/invalid-credential`: since Firebase enabled email
 * enumeration protection by default, a wrong password AND an unknown
 * email both return this one code, on purpose, so the form cannot be used
 * to check whether an address has an account. The message reflects that.
 */
export function authErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string } | undefined;
  const code = e?.code ?? '';
  switch (code) {
    // Sign in
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password. Check both and try again.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support if you think that is a mistake.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes, or reset your password.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    // Sign up
    case 'auth/email-already-in-use':
      return 'An account already exists for that email. Sign in instead, or reset your password.';
    case 'auth/weak-password':
      return 'That password is too weak — use at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email sign-in is not enabled right now. Contact support.';
    // Session
    case 'auth/requires-recent-login':
      return 'Please sign in again to continue.';
    default:
      return code && e?.message ? `${code}: ${e.message}` : (e?.message || 'Something went wrong. Try again.');
  }
}
