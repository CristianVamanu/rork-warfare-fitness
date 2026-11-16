/**
 * Shared plumbing for the /api/admin/finance routes: admin check, mirror
 * load (with an automatic catch-up sync when it is stale), member profiles
 * and the request's period / timezone / currency.
 */
import type { NextRequest } from 'next/server';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getStripe } from '@/lib/stripe';
import { loadFinData, syncFromStripe } from './sync';
import { currenciesIn, type Ctx } from './metrics';
import type { FinData, FinMeta } from './types';

export type FinanceReq = { uid: string; db: Firestore; data: FinData; meta: FinMeta; ctx: Ctx; from: number; to: number; currencies: string[] };

const STALE = 10 * 60;
let inflight: Promise<void> | null = null;

export async function financeRequest(req: NextRequest): Promise<FinanceReq | { error: string; status: number }> {
  const auth = await verifyAdmin(req);
  if ('error' in auth) return auth;
  const app = getAdminApp(); const db = app ? getAdminDb(app) : null;
  if (!db) return { error: 'Firebase Admin not configured', status: 500 };
  let { data, meta } = await loadFinData(db);
  // Catch up automatically once a backfill exists; the first backfill is an
  // explicit admin action (it can take a while on a long history).
  const now = Math.floor(Date.now() / 1000);
  if (meta.lastFullSyncAt && (!meta.lastSyncAt || now - meta.lastSyncAt > STALE)) {
    // One catch-up at a time per server, however many screens ask at once.
    inflight ??= getStripe().then((st) => syncFromStripe(db, st)).then(() => undefined).finally(() => { inflight = null; });
    try { await inflight; ({ data, meta } = await loadFinData(db)); }
    catch (err) { console.error('[finance] auto catch-up sync failed', err); }
  }
  const sp = req.nextUrl.searchParams;
  const tz = validTz(sp.get('tz')) ?? 'UTC';
  const to = clampTs(Number(sp.get('to')), now + 1);
  const from = clampTs(Number(sp.get('from')), to - 30 * 86_400);
  const currencies = currenciesIn(data);
  const cur = (sp.get('cur') || currencies[0] || 'gbp').toLowerCase();
  return { uid: auth.uid, db, data, meta, from: Math.min(from, to - 1), to, currencies, ctx: { data, cur, now, tz } };
}

function clampTs(v: number, fallback: number): number {
  return Number.isFinite(v) && v > 0 && v < 4_102_444_800 ? Math.floor(v) : fallback;
}
function validTz(tz: string | null): string | null {
  if (!tz) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}

let profileCache: { at: number; map: Map<string, { name: string | null; email: string | null; createdAt: number | null }> } | null = null;
/** Display name / email / registration date for the uids behind customers. */
export async function profiles(db: Firestore, data: FinData) {
  if (profileCache && Date.now() - profileCache.at < 10 * 60_000) return profileCache.map;
  const uids = new Set<string>();
  for (const c of data.customers) if (c.uid) uids.add(c.uid);
  for (const s of data.subscriptions) if (s.uid) uids.add(s.uid);
  const map = new Map<string, { name: string | null; email: string | null; createdAt: number | null }>();
  const ids = [...uids];
  for (let i = 0; i < ids.length; i += 300) {
    const snaps = await db.getAll(...ids.slice(i, i + 300).map((u) => db.collection('users').doc(u)));
    for (const s of snaps) {
      if (!s.exists) continue;
      const d = s.data() ?? {};
      const ca = d.createdAt as Timestamp | undefined;
      map.set(s.id, { name: d.displayName ?? d.name ?? null, email: d.email ?? null, createdAt: ca?.toMillis ? Math.floor(ca.toMillis() / 1000) : null });
    }
  }
  profileCache = { at: Date.now(), map };
  return map;
}

/** Account sign-up times in [from, to) for the customer-growth chart. */
export async function signupsBetween(db: Firestore, from: number, to: number): Promise<number[]> {
  try {
    const snap = await db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(from * 1000)).where('createdAt', '<', Timestamp.fromMillis(to * 1000)).select('createdAt').get();
    return snap.docs.map((d) => Math.floor((d.get('createdAt') as Timestamp).toMillis() / 1000));
  } catch (err) {
    console.error('[finance] signups query failed', err);
    return [];
  }
}

export const STRIPE_DASH = 'https://dashboard.stripe.com';
