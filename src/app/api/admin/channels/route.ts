export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';

function getAdminServices() {
  const app = getAdminApp();
  if (!app) return null;
  return { db: getFirestore(app), auth: getAuth(app) };
}

async function verifyAdmin(req: NextRequest): Promise<
  { uid: string; db: ReturnType<typeof getFirestore> } | { error: string; status: number }
> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: 'Missing authorization header', status: 401 };

  const svc = getAdminServices();
  if (!svc) {
    console.error('[channels] Firebase Admin not configured — check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY env vars');
    return { error: 'Server misconfiguration: Firebase Admin not initialized', status: 500 };
  }

  let uid: string;
  try {
    const decoded = await svc.auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch (err) {
    console.error('[channels] Token verification failed:', err);
    return { error: 'Invalid or expired token', status: 401 };
  }

  try {
    const userDoc = await svc.db.collection('users').doc(uid).get();
    const role = userDoc.data()?.role;
    if (role !== 'admin') {
      console.warn(`[channels] User ${uid} has role="${role}", not admin`);
      return { error: `Access denied: role is "${role}", requires "admin"`, status: 403 };
    }
    return { uid, db: svc.db };
  } catch (err) {
    console.error('[channels] User doc lookup failed:', err);
    return { error: 'Failed to verify admin role', status: 500 };
  }
}

// POST — create channel
export async function POST(req: NextRequest) {
  const result = await verifyAdmin(req);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await req.json() as Record<string, unknown>;
  const { name, description, emoji, photoUploadEnabled, slowModeDays, trainerId } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
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
  const result = await verifyAdmin(req);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await req.json() as Record<string, unknown>;
  const { id, ...data } = body;
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) update[k] = v;
  }

  try {
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
  const result = await verifyAdmin(req);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    await result.db.collection('channels').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[channels] DELETE failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
