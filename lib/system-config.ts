/**
 * system/config — single Firestore document, written once by the installer.
 *
 * Schema:
 *   system/config {
 *     adminUid:       string   — UID of the installer's admin account
 *     appName:        string
 *     trainerName:    string
 *     trainerEmail:   string
 *     openAiKey:      string   — encrypted at rest by Firestore rules
 *     stripeConfig: {
 *       publishableKey: string
 *       secretKey:      string
 *       webhookSecret:  string
 *     }
 *     setupCompleted: boolean
 *     createdAt:      string   — ISO timestamp
 *   }
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase-client';

const SYSTEM_DOC = 'system/config';

export interface StripeConfig {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
}

export interface SystemConfig {
  adminUid: string;
  appName: string;
  trainerName: string;
  trainerEmail: string;
  openAiKey: string;
  stripeConfig: StripeConfig;
  setupCompleted: boolean;
  createdAt: string;
  /** legacy compat — same value as createdAt */
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

/** Returns true if the installer has been completed. */
export async function isSetupComplete(): Promise<boolean> {
  const config = await getSystemConfig();
  return config?.setupCompleted === true;
}

/**
 * Called at the end of the installer wizard.
 * Creates system/config only if it does not exist yet (enforced by Firestore rule).
 * Does NOT pre-read the document — the rule blocks duplicate creates server-side.
 */
export async function completeSetup(params: {
  adminUid: string;
  appName: string;
  trainerName: string;
  trainerEmail: string;
  openAiKey: string;
  stripeConfig: StripeConfig;
}): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firestore not available. Check EXPO_PUBLIC_FIREBASE_* env vars.');
  const now = new Date().toISOString();
  await setDoc(doc(db, SYSTEM_DOC), {
    ...params,
    setupCompleted: true,
    createdAt: now,
    installedAt: now,
  });
  console.log('[SystemConfig] Installer completed. Admin UID:', params.adminUid);
}

/**
 * Migration: if system/config is missing but users/{uid}.isAdmin === true
 * (legacy field from before the self-hosted SaaS migration), create system/config
 * now so checkIsAdmin() works going forward.
 */
export async function migrateAdminFromLegacyField(uid: string, email: string): Promise<boolean> {
  const db = getFirebaseDb();
  if (!db) return false;
  const ref = doc(db, SYSTEM_DOC);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return false; // nothing to migrate
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists() || userSnap.data()?.isAdmin !== true) return false;
    const now = new Date().toISOString();
    await setDoc(ref, {
      adminUid: uid,
      appName: 'Warfare Fitness',
      trainerName: '',
      trainerEmail: email,
      openAiKey: '',
      stripeConfig: { publishableKey: '', secretKey: '', webhookSecret: '' },
      setupCompleted: true,
      createdAt: now,
      installedAt: now,
    });
    console.log('[SystemConfig] Migrated legacy admin to system/config. UID:', uid);
    return true;
  } catch (e) {
    console.error('[SystemConfig] migration failed:', e);
    return false;
  }
}

/**
 * Legacy bootstrap: called during new user registration if installer was skipped.
 * Creates system/config only if it does not exist yet.
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
      openAiKey: '',
      stripeConfig: { publishableKey: '', secretKey: '', webhookSecret: '' },
      setupCompleted: true,
      createdAt: now,
      installedAt: now,
    });
    console.log('[SystemConfig] Bootstrapped. Admin UID:', uid);
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
