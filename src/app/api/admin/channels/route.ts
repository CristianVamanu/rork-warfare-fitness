/**
 * Admin channel management via Firebase Admin SDK.
 * Bypasses Firestore client rules — auth is verified by checking the
 * caller's user doc role server-side instead.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function getAdminServices() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) return null;
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return { db: getFirestore(), auth: getAuth() };
}

async function verifyAdmin(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const svc = getAdminServices();
  if (!svc) return null;
  try {
    const decoded = await svc.auth.verifyIdToken(token);
    const userDoc = await svc.db.collection('users').doc(decoded.uid).get();
    if (userDoc.data()?.role !== 'admin') return null;
    return { uid: decoded.uid, db: svc.db };
  } catch {
    return null;
  }
}

// POST — create channel
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const { name, description, emoji, photoUploadEnabled, slowModeDays, trainerId } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const ref = await admin.db.collection('channels').add({
    name: (name as string).trim(),
    description: description || null,
    emoji: emoji || null,
    createdBy: admin.uid,
    trainerId: trainerId || admin.uid,
    photoUploadEnabled: photoUploadEnabled !== false,
    slowModeDays: slowModeDays ?? 0,
    postCount: 0,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id });
}

// PATCH — update channel
export async function PATCH(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const { id, ...data } = body;
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Remove undefined/null fields cleanly
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) update[k] = v;
  }

  await admin.db.collection('channels').doc(id).update(update);
  return NextResponse.json({ ok: true });
}

// DELETE — delete channel
export async function DELETE(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await admin.db.collection('channels').doc(id).delete();
  return NextResponse.json({ ok: true });
}
