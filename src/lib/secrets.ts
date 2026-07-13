import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { encryptSecret, decryptSecret, maskSecret, type EncryptedPayload } from '@/lib/crypto';

/**
 * All third-party keys the app can be configured with. Admins set these
 * from the dashboard; they're encrypted and stored in Firestore at
 * system/secrets, falling back to the platform env var of the same name
 * if no override has been saved (so existing Vercel deployments keep working).
 */
export const SECRET_KEYS = [
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'VAPID_PRIVATE_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
] as const;

export type SecretKey = typeof SECRET_KEYS[number];

function getDb() {
  const app = getAdminApp();
  return app ? getAdminDb(app) : null;
}

function docRef(db: FirebaseFirestore.Firestore) {
  return db.collection('system').doc('secrets');
}

/** Resolve a secret's live value: Firestore override first, then env var. Returns '' if neither set. */
export async function getSecret(key: SecretKey): Promise<string> {
  const db = getDb();
  if (db) {
    try {
      const snap = await docRef(db).get();
      const stored = snap.data()?.[key] as EncryptedPayload | undefined;
      if (stored?.ciphertext) return decryptSecret(stored);
    } catch (err) {
      console.error(`[secrets] Failed to decrypt ${key}:`, err);
    }
  }
  return process.env[key] ?? '';
}

export async function setSecret(key: SecretKey, plaintext: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Firestore admin not configured');
  if (!plaintext) {
    await docRef(db).set({ [key]: FieldValue.delete() }, { merge: true });
    return;
  }
  const payload = encryptSecret(plaintext);
  await docRef(db).set({ [key]: payload }, { merge: true });
}

export interface SecretStatus {
  key: SecretKey;
  configured: boolean;
  source: 'firestore' | 'env' | 'none';
  masked: string;
}

/** Status for every known secret — for the admin "Integrations" panel. Never returns plaintext. */
export async function listSecretStatuses(): Promise<SecretStatus[]> {
  const db = getDb();
  let stored: Record<string, EncryptedPayload> = {};
  if (db) {
    try {
      const snap = await docRef(db).get();
      stored = (snap.data() ?? {}) as Record<string, EncryptedPayload>;
    } catch (err) {
      console.error('[secrets] Failed to load statuses:', err);
    }
  }

  return SECRET_KEYS.map((key) => {
    const fsPayload = stored[key];
    if (fsPayload?.ciphertext) {
      try {
        const plaintext = decryptSecret(fsPayload);
        return { key, configured: true, source: 'firestore' as const, masked: maskSecret(plaintext) };
      } catch {
        return { key, configured: false, source: 'none' as const, masked: '' };
      }
    }
    const envVal = process.env[key];
    if (envVal) {
      return { key, configured: true, source: 'env' as const, masked: maskSecret(envVal) };
    }
    return { key, configured: false, source: 'none' as const, masked: '' };
  });
}
