import type { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';

export async function verifyAdmin(req: NextRequest): Promise<{ uid: string } | { error: string; status: number }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return { error: 'Missing authorization header', status: 401 };

  const app = getAdminApp();
  if (!app) return { error: 'Firebase Admin not configured', status: 500 };

  let uid: string;
  try {
    const decoded = await getAuth(app).verifyIdToken(token);
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
