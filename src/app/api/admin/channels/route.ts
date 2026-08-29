export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin as verifyAdminShared } from '@/lib/verifyAdmin';

// Was a local reimplementation that checked the token + role but never
// rejected a session still pending its 2FA code (decoded.tfaPending) — every
// other admin route uses the shared verifyAdmin, which does. Since this
// route uses firebase-admin directly (bypasses firestore.rules, so
// notTfaPending() never runs either), a stolen admin ID token that hasn't
// cleared 2FA yet could still create/update/delete community channels.
async function verifyAdmin(req: NextRequest) {
  const result = await verifyAdminShared(req);
  if ('error' in result) return result;
  const app = getAdminApp();
  if (!app) return { error: 'Server misconfiguration: Firebase Admin not initialized', status: 500 };
  return { uid: result.uid, db: getAdminDb(app) };
}

// POST — create channel
export async function POST(req: NextRequest) {
  try {
    const result = await verifyAdmin(req);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    const body = await req.json() as Record<string, unknown>;
    const { name, description, emoji, photoUploadEnabled, slowModeDays, trainerId } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const ref = await result.db.collection('channels').add({
      name: (name as string).trim(),
      description: description || null,
      emoji: emoji || null,
      createdBy: result.uid,
      trainerId: trainerId || result.uid,
      photoUploadEnabled: photoUploadEnabled !== false,
      slowModeDays: slowModeDays ?? 0,
      postCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: ref.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[channels] POST failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — update channel
export async function PATCH(req: NextRequest) {
  try {
    const result = await verifyAdmin(req);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    const body = await req.json() as Record<string, unknown>;
    const { id, ...data } = body;
    if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 });

    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) update[k] = v;
    }

    await result.db.collection('channels').doc(id).update(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[channels] PATCH failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — delete channel
export async function DELETE(req: NextRequest) {
  try {
    const result = await verifyAdmin(req);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    const { id } = await req.json() as { id: string };
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // recursiveDelete also removes posts/{postId}/replies and members —
    // a plain doc delete only removed the channel itself, orphaning every
    // subcollection underneath it permanently.
    await result.db.recursiveDelete(result.db.collection('channels').doc(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[channels] DELETE failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
