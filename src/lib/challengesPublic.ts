import 'server-only';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

/** The teaser of one challenge for the public share page. Live and closed
 *  only; a draft is as invisible here as it is to members. */
export interface PublicChallenge {
  id: string;
  title: string;
  brief: string;
  category: string | null;
  difficulty: string;
  status: 'live' | 'closed';
  cover: { url: string; type: 'image' | 'video'; posterURL: string | null } | null;
  entryCount: number;
  verifiedCount: number;
  endsAt: string | null;
}

export async function loadPublicChallenge(id: string): Promise<PublicChallenge | null> {
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const app = getAdminApp();
  if (!app) return null;
  try {
    const snap = await getAdminDb(app).collection('challenges').doc(id).get();
    const c = snap.data();
    if (!snap.exists || !c || (c.status !== 'live' && c.status !== 'closed')) return null;
    const first = Array.isArray(c.media) && c.media[0] ? c.media[0] : null;
    return {
      id: snap.id,
      title: String(c.title ?? '').slice(0, 120),
      brief: String(c.brief ?? '').slice(0, 300),
      category: c.category ? String(c.category).slice(0, 40) : null,
      difficulty: String(c.difficulty ?? 'standard'),
      status: c.status,
      cover: first ? { url: String(first.url), type: first.type === 'video' ? 'video' : 'image', posterURL: first.posterURL ? String(first.posterURL) : null } : null,
      entryCount: Number(c.entryCount) || 0,
      verifiedCount: Number(c.verifiedCount) || 0,
      endsAt: c.endsAt?.toDate?.()?.toISOString?.() ?? null,
    };
  } catch (err) {
    console.error('[challenges] public load failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** First name of the member behind a referral code, for "X sent you this". */
export async function loadReferrerName(code: string | undefined): Promise<string | null> {
  if (!code || !/^[A-Za-z0-9]{4,16}$/.test(code)) return null;
  const app = getAdminApp();
  if (!app) return null;
  try {
    const db = getAdminDb(app);
    const uid = (await db.collection('referralCodes').doc(code).get()).data()?.uid as string | undefined;
    if (!uid) return null;
    const displayName = (await db.collection('users').doc(uid).get()).data()?.displayName as string | undefined;
    return displayName?.trim().split(/\s+/)[0]?.slice(0, 30) || null;
  } catch {
    return null;
  }
}
