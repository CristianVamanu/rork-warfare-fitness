import 'server-only';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { buildTrialTerms, planHasAnyPrice, type TrialTerms } from '@/lib/utils';
import type { MembershipConfig, MembershipPlan } from '@/types';

/**
 * Branding for the public pages, read with the Admin SDK.
 *
 * The layout's own getBranding() goes through the CLIENT SDK on the server,
 * which is the source of the build-time auth/invalid-api-key noise. These
 * pages are statically revalidated, so they read through the admin credentials
 * the rest of the server already uses.
 */
let cache: { at: number; value: { appName: string; logoUrl: string | null } } | null = null;

export async function getPublicBranding(): Promise<{ appName: string; logoUrl: string | null }> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const fallback = { appName: 'Warfare Fitness', logoUrl: null };
  try {
    const app = getAdminApp();
    if (!app) return fallback;
    const snap = await getAdminDb(app).collection('system').doc('config').get();
    const value = {
      appName: (snap.data()?.appName as string) || fallback.appName,
      logoUrl: (snap.data()?.logoUrl as string) || null,
    };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return fallback;
  }
}

/**
 * The live trial terms, for the public marketing pages.
 *
 * These pages used to hardcode "Start Free" and "You won't be charged until
 * the trial is up". That was true when the trial was free and became a false
 * advertising claim the moment Paid Trial was switched on in the admin panel —
 * on statically-rendered pages that would have gone on saying it for an hour
 * after the change, to exactly the cold search traffic least likely to give
 * the benefit of the doubt. Read from the same two config docs the app reads,
 * so flipping the toggle rewrites the marketing pages too.
 *
 * Falls back to the terms-free CTA rather than to a "free" claim: with no
 * config we do not know what the trial costs, and the safe unknown is silence,
 * not a promise.
 */
export async function getPublicTrialTerms(): Promise<TrialTerms> {
  const fallback: TrialTerms = { ctaLabel: 'Get Started', disclosure: 'Cancel anytime.' };
  try {
    const app = getAdminApp();
    if (!app) return fallback;
    const db = getAdminDb(app);
    const [cfgSnap, plansSnap] = await Promise.all([
      db.collection('config').doc('membership').get(),
      db.collection('config').doc('membershipPlans').get(),
    ]);
    const cfg = cfgSnap.data() as MembershipConfig | undefined;
    if (!cfg?.enabled) return fallback;
    const plans = ((plansSnap.data()?.plans as MembershipPlan[]) ?? [])
      .filter((p) => p.active && planHasAnyPrice(p));
    return buildTrialTerms({
      trialDays: cfg.trialDays ?? 0,
      paidTrialEnabled: !!cfg.paidTrialEnabled,
      cardUpFrontTrial: !!cfg.cardUpFrontTrial,
      trialPriceCents: cfg.trialPriceCents,
      plans,
    });
  } catch {
    return fallback;
  }
}
