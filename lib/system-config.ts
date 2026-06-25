/**
 * system/config — single Firestore document storing installation-level config.
 *
 * Written during the setup wizard (first run) and on first registration.
 * Read on every auth state change to determine isAdmin.
 *
 * Schema:
 *   system/config {
 *     adminUid: string,
 *     appName: string,
 *     trainerName: string,
 *     trainerEmail: string,
 *     setupCompleted: boolean,
 *     createdAt: string,
 *     installedAt?: string,   // legacy compat
 *   }
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase-client';

const SYSTEM_DOC = 'system/config';

export interface SystemConfig {
  adminUid: string;
  appName: string;
  trainerName: string;
  trainerEmail: string;
  setupCompleted: boolean;
  createdAt: string;
  installedAt?: string;
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

/** Returns true if the setup wizard has been completed. */
export async function isSetupComplete(): Promise<boolean> {
  const config = await getSystemConfig();
  return config?.setupCompleted === true;
}

/**
 * Called at the end of the setup wizard.
 * Creates system/config only if it does not exist yet.
 */
export async function completeSetup(params: {
  adminUid: string;
  appName: string;
  trainerName: string;
  trainerEmail: string;
}): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firestore not available');
  const ref = doc(db, SYSTEM_DOC);
  const snap = await getDoc(ref);
  if (snap.exists()) throw new Error('Setup has already been completed');
  const now = new Date().toISOString();
  await setDoc(ref, {
    ...params,
    setupCompleted: true,
    createdAt: now,
    installedAt: now,
  });
  console.log('[SystemConfig] Setup completed. Admin UID:', params.adminUid);
}

/**
 * Legacy bootstrap: called during first-ever registration (fallback if setup page was skipped).
 * Sets adminUid ONLY if system/config does not yet exist.
 * Returns true if this user was promoted to admin.
 */
export async function bootstrapAdminIfNeeded(uid: string): Promise<boolean> {
  const db = getFirebaseDb();
  if (!db) return false;
  const ref = doc(db, SYSTEM_DOC);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return false;
    const now = new Date().toISOString();
    await setDoc(ref, {
      adminUid: uid,
      appName: 'Warfare Fitness',
      trainerName: '',
      trainerEmail: '',
      setupCompleted: true,
      createdAt: now,
      installedAt: now,
    });
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
