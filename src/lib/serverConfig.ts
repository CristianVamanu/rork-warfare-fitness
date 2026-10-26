import 'server-only';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { getSystemConfig, getMembershipConfig, getMembershipPlans } from '@/lib/firestore';
import type { MembershipConfig, MembershipPlan } from '@/types';

/**
 * The settings the public landing page renders from, read fresh on the
 * server.
 *
 * The page used the browser Firestore SDK on the server, with a five-minute
 * in-memory cache per PM2 worker. After an admin changed the trial (free,
 * then back to $1), any worker that had read the old value kept rendering
 * it, so the first paint said "7 days free" and the browser's own fetch then
 * swapped it to "$1" a few seconds later. The browser SDK on a server can
 * also quietly fall back to its cached copy when its connection drops,
 * which the server logs show happens.
 *
 * The Admin SDK makes a plain request every time and has no offline cache,
 * so the first paint always matches what the admin last saved. A short
 * 10-second memo keeps a burst of ad traffic from turning into one read per
 * visitor. If the Admin SDK is not configured, the old path is used.
 */
const TTL_MS = 10_000;
let memo: { at: number; value: LandingSettings } | null = null;

export interface LandingSettings {
  system: Record<string, unknown> | null;
  membership: MembershipConfig | null;
  plans: MembershipPlan[];
}

export async function getLandingSettings(): Promise<LandingSettings> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  const app = getAdminApp();
  if (app) {
    try {
      const db = getAdminDb(app);
      const [sys, mem, plans] = await Promise.all([
        db.collection('system').doc('config').get(),
        db.collection('config').doc('membership').get(),
        db.collection('config').doc('membershipPlans').get(),
      ]);
      const value: LandingSettings = {
        system: sys.exists ? (sys.data() as Record<string, unknown>) : null,
        membership: mem.exists ? (mem.data() as MembershipConfig) : null,
        plans: ((plans.data()?.plans as MembershipPlan[] | undefined) ?? []),
      };
      memo = { at: Date.now(), value };
      return value;
    } catch (err) {
      console.warn('[landing] admin read failed, falling back:', err instanceof Error ? err.message : err);
    }
  }
  const [system, membership, plans] = await Promise.all([
    getSystemConfig().catch(() => null),
    getMembershipConfig().catch(() => null),
    getMembershipPlans().catch(() => [] as MembershipPlan[]),
  ]);
  return { system: (system as Record<string, unknown> | null) ?? null, membership, plans };
}
