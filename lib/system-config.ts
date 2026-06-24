/**
 * system/config — single Firestore document that stores installation-level config.
 *
 * Written once on first registration (bootstrap).
 * Read on every auth state change to determine isAdmin.
 *
 * Schema:
 *   system/config { adminUid: string, installedAt: string }
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase-client';

const SYSTEM_DOC = 'system/config';

export interface SystemConfig {
  adminUid: string;
  installedAt: string;
}

/** Returns the system config doc, or null if Firestore is unavailable or doc doesn't exist. */
export async function getSystemConfig(): Promise<SystemConfig | null> {
  const db = getFirebaseDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, SYSTEM_DOC));
    if (!snap.exists()) return null;
    return snap.data() as SystemConfig;
  } catch (e) {
    console.error('[SystemConfig] read failed:', e);
    return null;
  }
}

/**
 * Bootstrap: called during first-ever registration.
 * Sets adminUid ONLY if system/config does not yet exist.
 * Returns true if this user was promoted to admin.
 */
export async function bootstrapAdminIfNeeded(uid: string): Promise<boolean> {
  const db = getFirebaseDb();
  if (!db) return false;
  const ref = doc(db, SYSTEM_DOC);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return false; // already bootstrapped — not first user
    await setDoc(ref, { adminUid: uid, installedAt: new Date().toISOString() });
    console.log('[SystemConfig] Installation bootstrapped. Admin UID:', uid);
    return true;
  } catch (e) {
    console.error('[SystemConfig] bootstrap failed:', e);
    return false;
  }
}

/** Returns true if uid matches the stored adminUid. */
export async function checkIsAdmin(uid: string): Promise<boolean> {
  const config = await getSystemConfig();
  return config?.adminUid === uid;
}
