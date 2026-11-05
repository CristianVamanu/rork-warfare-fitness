/**
 * Billing inside the native iOS/Android apps.
 *
 * Google Play and the App Store require purchases of digital memberships
 * made inside an app to go through their own billing, and forbid steering
 * to an outside checkout from within the app. So the apps never open Stripe:
 * every purchase entry point goes to /membership, which sells Google Play
 * subscriptions through RevenueCat when configured (lib/native/purchases)
 * and is otherwise a neutral notice. The website is unchanged.
 *
 * Every purchase entry point calls `nativeBillingBlocked()` first and, when
 * true, sends the user to the notice instead of Stripe.
 */
import { isNativeApp } from '@/lib/native/health';

export const NATIVE_MEMBERSHIP_PATH = '/membership';

export function nativeBillingBlocked(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isNativeApp() || navigator.userAgent.includes('WarfareFitnessNative');
}

/** Replaces a checkout navigation inside the app. Returns true when it did. */
export function redirectToNativeMembershipNotice(): boolean {
  if (!nativeBillingBlocked()) return false;
  window.location.href = NATIVE_MEMBERSHIP_PATH;
  return true;
}
