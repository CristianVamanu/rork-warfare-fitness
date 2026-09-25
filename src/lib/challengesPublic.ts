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

function toPublic(id: string, c: FirebaseFirestore.DocumentData): PublicChallenge {
  const first = Array.isArray(c.media) && c.media[0] ? c.media[0] : null;
  return {
    id,
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
}

/**
 * Every challenge a visitor may see, live first, newest first within each
 * status. Drafts never leave the admin. Read with the Admin SDK because the
 * rules only let signed-in members read the collection; the public page is
 * the one place the teaser is shown without an account.
 */
export async function loadPublicChallenges(): Promise<PublicChallenge[]> {
  const app = getAdminApp();
  if (!app) return [];
  try {
    const snap = await getAdminDb(app).collection('challenges').where('status', 'in', ['live', 'closed']).limit(60).get();
    const rank = (s: string) => (s === 'live' ? 0 : 1);
    return snap.docs
      .map((d) => ({ doc: toPublic(d.id, d.data()), createdMs: d.data().createdAt?.toMillis?.() ?? 0 }))
      .sort((a, b) => rank(a.doc.status) - rank(b.doc.status) || b.createdMs - a.createdMs)
      .map((x) => x.doc);
  } catch (err) {
    console.error('[challenges] public list failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function loadPublicChallenge(id: string): Promise<PublicChallenge | null> {
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const app = getAdminApp();
  if (!app) return null;
  try {
    const snap = await getAdminDb(app).collection('challenges').doc(id).get();
    const c = snap.data();
    if (!snap.exists || !c || (c.status !== 'live' && c.status !== 'closed')) return null;
    return toPublic(snap.id, c);
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
