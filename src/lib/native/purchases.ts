/**
 * Google Play subscriptions in the Android app, through RevenueCat.
 *
 * On inside the app; the public "goog_..." SDK key is below (overridable
 * with NEXT_PUBLIC_REVENUECAT_ANDROID_KEY). The member is logged in to
 * RevenueCat with their Firebase uid, so the RevenueCat webhook
 * (/api/revenuecat/webhook) can write the membership to the right account.
 * App builds without the plugin reject the import; callers then fall back
 * to the plain membership notice.
 */
import { nativePlatform } from '@/lib/native/health';

// RevenueCat's public Google Play SDK key. Public by design (it ships inside
// every app build); an env value overrides it.
const KEY = process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY || 'goog_hybWGqQAoooKClEMBLOffJKUyld';

export function inAppPurchasesEnabled(): boolean {
  // Android only: the key is a Google Play key, and the iPhone app has no
  // in-app purchases set up.
  return !!KEY && nativePlatform() === 'android';
}

let configuredFor: string | null = null;
let step = 'start';

// A native call that never answers would leave the paywall spinning forever;
// fail with a step code instead so the screen can say what got stuck.
function within<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej({ code: `timeout-${step}` }), ms))]);
}

async function rc(uid: string) {
  step = 'plugin';
  const { Purchases } = await within(import('@revenuecat/purchases-capacitor'), 10000, 'plugin');
  if (configuredFor === null) {
    step = 'configure';
    await within(Purchases.configure({ apiKey: KEY, appUserID: uid }), 10000, 'configure');
    configuredFor = uid;
  } else if (configuredFor !== uid) {
    step = 'login';
    await within(Purchases.logIn({ appUserID: uid }), 10000, 'login');
    configuredFor = uid;
  }
  return Purchases;
}

export interface StorePackage { id: string; title: string; price: string; period: string | null; raw: unknown }

/** The current offering's packages, priced by Google Play in the member's currency. */
export function loadPackages(uid: string): Promise<StorePackage[]> {
  // One overall budget as well as the per-step ones: the member should see
  // a reason within seconds, not after every step has timed out in turn.
  return within(loadPackagesInner(uid), 12000, 'total').catch((e: unknown) => {
    const c = (e as { code?: string })?.code;
    throw c === 'timeout-total' ? { code: `timeout-total@${step}` } : e;
  });
}

async function loadPackagesInner(uid: string): Promise<StorePackage[]> {
  const P = await rc(uid);
  step = 'offerings';
  const o = await within(P.getOfferings(), 15000, 'offerings');
  return (o.current?.availablePackages ?? []).map((p) => ({
    id: p.identifier,
    title: p.product.title.replace(/\s*\(.*\)\s*$/, ''),
    price: p.product.priceString,
    period: p.packageType === 'ANNUAL' ? 'year' : p.packageType === 'MONTHLY' ? 'month' : p.packageType === 'WEEKLY' ? 'week' : null,
    raw: p,
  }));
}

/** True when the purchase went through; false when the member cancelled the sheet. */
export async function buyPackage(uid: string, pkg: StorePackage): Promise<boolean> {
  const P = await rc(uid);
  try {
    await P.purchasePackage({ aPackage: pkg.raw as Parameters<typeof P.purchasePackage>[0]['aPackage'] });
    return true;
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return false;
    throw e;
  }
}

/** Re-syncs past Play purchases to this account; the webhook then updates the membership. */
export async function restore(uid: string): Promise<boolean> {
  const P = await rc(uid);
  const { customerInfo } = await P.restorePurchases();
  return Object.keys(customerInfo.entitlements.active).length > 0;
}
