export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

// Banning used to only set a `banned` flag on the user's own Firestore
// doc, enforced by a client-side route guard ((app)/layout.tsx redirecting
// to /banned). That stops a banned user inside the app's normal UI, but
// nothing at the data layer actually prevented raw Firestore SDK calls
// bypassing that UI entirely — the only rule referencing `banned` is the
// one stopping a user from unsetting it on themselves, not one blocking
// reads/writes elsewhere for a banned caller.
//
// Disabling the Firebase Auth account is the real enforcement boundary:
// once disabled, the account can't sign in at all, and revoking refresh
// tokens forces any already-open session to fail its next token refresh
// (Firebase Auth denies refreshes for disabled accounts) instead of
// staying validly authenticated until its current ID token happens to
// expire on its own.
export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { userId, action } = await req.json() as { userId?: string; action?: 'ban' | 'unban' };
  if (!userId || (action !== 'ban' && action !== 'unban')) {
    return NextResponse.json({ error: 'userId and action ("ban" | "unban") are required' }, { status: 400 });
  }
  if (userId === check.uid) return NextResponse.json({ error: "You can't ban your own admin account" }, { status: 400 });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  try {
    const auth = getAuth(app);
    const db = getAdminDb(app);

    if (action === 'ban') {
      await auth.updateUser(userId, { disabled: true });
      await auth.revokeRefreshTokens(userId);
      await db.collection('users').doc(userId).update({ banned: true, bannedAt: FieldValue.serverTimestamp() });
    } else {
      await auth.updateUser(userId, { disabled: false });
      await db.collection('users').doc(userId).update({ banned: false, bannedAt: FieldValue.delete() });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/ban-user] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to update ban status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
