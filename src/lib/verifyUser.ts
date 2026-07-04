import type { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';

/** Verifies the request carries a valid Firebase ID token for any signed-in user (not admin-only). */
export async function verifyUser(req: NextRequest): Promise<{ uid: string } | { error: string; status: number }> {
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
