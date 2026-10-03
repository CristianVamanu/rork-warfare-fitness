import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from './firebase-admin';

/**
 * The address an account actually signs in with.
 *
 * `users/{uid}.email` was treated as authoritative in six server paths —
 * Stripe customer creation, the billing portal, dunning and trial emails,
 * account deletion, and the admin error digest — on the stated assumption
 * that "it is written only by the server (signup, change-email) so it is the
 * account's real address." That held until Firebase's own `recoverEmail`
 * action was handled: when a hijacked address change is reverted, Firebase
 * Auth flips back and the profile document keeps the attacker's address. From
 * then on receipts, payment-failure notices and the billing portal would all
 * have gone to the wrong person, on the one account where that matters most.
 *
 * Firebase Auth is the source of truth; the document is a cache of it. Read
 * Auth first and fall back to the document only if Auth cannot answer (admin
 * SDK unconfigured, or the Auth user is already gone mid-deletion).
 */
export async function resolveAccountEmail(uid: string, docEmail?: string | null): Promise<string | undefined> {
  try {
    const app = getAdminApp();
    if (app) {
      const user = await getAuth(app).getUser(uid);
      if (user.email) return user.email;
    }
  } catch {
    // Fall through to the cached value — an Auth lookup failure must not turn
    // into a billing email that goes nowhere.
  }
  return docEmail || undefined;
}
