import type { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

export async function verifyAuthed(req: NextRequest): Promise<{ uid: string } | { error: string; status: number }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: 'Missing authorization header', status: 401 };

  const app = getAdminApp();
  if (!app) return { error: 'Firebase Admin not configured', status: 500 };

  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return { error: 'Invalid or expired token', status: 401 };
  }
}

// Same as verifyAuthed, but also rejects a session still pending its 2FA
// code (tfaPending:true) — for routes where that would otherwise let a
// stolen-but-not-yet-2FA'd session bypass the check entirely, since these
// use firebase-admin directly and never pass through firestore.rules'
// notTfaPending(). Deliberately NOT folded into verifyAuthed itself: the
// 2FA login-check/verify routes above call verifyAuthed while the session
// is still tfaPending by design (that's the whole point of those calls).
export async function verifyAuthedNotTfaPending(req: NextRequest): Promise<{ uid: string } | { error: string; status: number }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: 'Missing authorization header', status: 401 };

  const app = getAdminApp();
  if (!app) return { error: 'Firebase Admin not configured', status: 500 };

  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    if (decoded.tfaPending === true) {
      return { error: '2FA verification required', status: 403 };
    }
    return { uid: decoded.uid };
  } catch {
    return { error: 'Invalid or expired token', status: 401 };
  }
}

export async function verifyAdmin(req: NextRequest): Promise<{ uid: string } | { error: string; status: number }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: 'Missing authorization header', status: 401 };

  const app = getAdminApp();
  if (!app) return { error: 'Firebase Admin not configured', status: 500 };

  let uid: string;
  // These admin API routes use firebase-admin, which bypasses Firestore
  // rules entirely — notTfaPending() (the actual documented enforcement
  // mechanism for 2FA) never runs for them. Checking the decoded custom
  // claim here directly is what closes that: without it, a stolen admin ID
  // token that hasn't passed its 2FA code yet (tfaPending:true) could still
  // call ban-user, delete-user, secrets, etc. directly, since only the
  // Firestore-rules path was ever gated.
  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    if (decoded.tfaPending === true) {
      return { error: '2FA verification required', status: 403 };
    }
    uid = decoded.uid;
  } catch {
    return { error: 'Invalid or expired token', status: 401 };
  }

  try {
    const userDoc = await getAdminDb(app).collection('users').doc(uid).get();
    if (userDoc.data()?.role !== 'admin') {
      return { error: 'Access denied: admin only', status: 403 };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to verify admin role';
    return { error: msg, status: 500 };
  }

  return { uid };
}
