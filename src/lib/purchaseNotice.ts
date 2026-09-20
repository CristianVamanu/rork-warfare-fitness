/**
 * Saying "thanks for paying" exactly once.
 *
 * Stripe returns a member to /dashboard?subscribed=1 and two things read
 * that flag: the congratulations toast, and MembershipGuard, which uses it
 * to hold the paywall back until the webhook lands. Nothing ever removed
 * it, so it sat in the address bar for the rest of the visit.
 *
 * That was invisible until something reloaded the page. Confirming an email
 * code does exactly that (VerifyEmailNotice calls window.location.reload()
 * so the refreshed ID token is picked up), and the member — who had paid
 * minutes earlier and already been thanked — was told "Payment received,
 * unlocking your membership now" a second time. It reads as a second
 * charge.
 *
 * The toast is the visible half. The other half is worse and silent:
 * trackEvent('Purchase') fired again too, so one sale was reported as two
 * conversions every time somebody verified their email after paying.
 *
 * Two independent defences, because one of them is about ordering and
 * ordering is easy to get wrong later:
 *
 *  1. This module — announce once per kind, per browser session, whatever
 *     the URL says.
 *  2. Stripping the parameter once it has been read (see clearSubscribedParam
 *     and its caller), so a reload has nothing to re-trigger.
 *
 * Kept pure and separate so both halves can be asserted without a browser.
 */

/** The values ?subscribed= is set to: a membership, or a coaching plan. */
export type PurchaseKind = '1' | 'coaching';

const KEY = 'wf_purchase_announced';

/**
 * Has this kind of purchase already been announced this session?
 *
 * Keyed by kind rather than a single boolean: somebody can buy a membership
 * and then a coaching plan in one sitting, and the second purchase deserves
 * its own confirmation. A flat flag would swallow it.
 */
export function shouldAnnounce(stored: string | null, kind: PurchaseKind): boolean {
  if (!stored) return true;
  return !stored.split(',').filter(Boolean).includes(kind);
}

/** The new marker value after announcing `kind`. Idempotent. */
export function recordAnnounced(stored: string | null, kind: PurchaseKind): string {
  const seen = stored ? stored.split(',').filter(Boolean) : [];
  return seen.includes(kind) ? seen.join(',') : [...seen, kind].join(',');
}

/**
 * Browser wrapper: true at most once per kind per session.
 *
 * A throwing sessionStorage (private mode, blocked site data) falls through
 * to announcing. Thanking someone twice in a locked-down browser is a far
 * smaller failure than never thanking them at all.
 */
export function announceOnce(kind: PurchaseKind): boolean {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(KEY);
  } catch {
    return true;
  }
  if (!shouldAnnounce(stored, kind)) return false;
  try {
    sessionStorage.setItem(KEY, recordAnnounced(stored, kind));
  } catch { /* announced anyway — see above */ }
  return true;
}

/**
 * Drop ?subscribed= from the address bar, keeping everything else.
 *
 * replaceState rather than router.replace: this runs inside an effect that
 * other effects have already read the parameter in, and a real navigation
 * would remount the tree underneath them. Nothing needs to re-render — the
 * only job is that a reload of this URL no longer looks like an arrival
 * from checkout.
 */
export function clearSubscribedParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('subscribed')) return;
    url.searchParams.delete('subscribed');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* nothing depends on this succeeding */ }
}
