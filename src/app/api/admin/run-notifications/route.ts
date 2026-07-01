export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only trigger for the notification processor.
 * Verifies Firebase ID token + admin role, then calls the cron handler internally.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';

function getAdminServices() {
  const app = getAdminApp();
  if (!app) return null;
  return { db: getFirestore(app), auth: getAuth(app) };
}

async function verifyAdmin(req: NextRequest): Promise<{ uid: string } | { error: string; status: number }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: 'Missing authorization header', status: 401 };

  const svc = getAdminServices();
  if (!svc) return { error: 'Firebase Admin not configured', status: 500 };

  let uid: string;
  try {
    const decoded = await svc.auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return { error: 'Invalid or expired token', status: 401 };
  }

  const userDoc = await svc.db.collection('users').doc(uid).get();
  if (userDoc.data()?.role !== 'admin') {
    return { error: 'Access denied: admin only', status: 403 };
  }

  return { uid };
}

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  // Forward to the cron processor with the CRON_SECRET so it passes auth
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`;
  const secret = process.env.CRON_SECRET;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['Authorization'] = `Bearer ${secret}`;

  const res = await fetch(`${baseUrl}/api/notifications/process`, {
    method: 'POST',
    headers,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
