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
  // Separate from R2_BUCKET_NAME on purpose — that bucket is public (it
  // serves exercise videos, PR Wall photos), and full-database backups
  // must never live somewhere with public read access. Falls back to
  // R2_BUCKET_NAME with a loud warning if left unset, so backups don't
  // silently fail, but a dedicated private bucket is what this is for.
  'R2_BACKUP_BUCKET_NAME',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
] as const;

export type SecretKey = typeof SECRET_KEYS[number];

function getDb() {
  const app = getAdminApp();
  return app ? getAdminDb(app) : null;
}

function docRef(db: FirebaseFirestore.Firestore) {
  return db.collection('system').doc('secrets');
}

/**
 * Process-local cache of the decrypted secrets document.
 *
 * getSecret() used to read system/secrets from Firestore and run AES-GCM on
 * EVERY call — and every Stripe, OpenAI, Resend and R2 operation calls it,
 * some several times per request. That is an extra Firestore round-trip on
 * every money and AI path for a value that changes only when an admin edits
 * it. The doc is fetched once and reused for a minute; setSecret() clears it
 * so an admin's own change is visible to this worker immediately (the other
 * pm2 worker catches up within the TTL). The in-flight promise is cached
 * too, so a burst of concurrent calls shares one read.
 */
const SECRETS_TTL_MS = 60_000;
let secretsCache: { at: number; promise: Promise<Record<string, EncryptedPayload> | null> } | null = null;

async function loadSecretsDoc(): Promise<Record<string, EncryptedPayload> | null> {
  const db = getDb();
  if (!db) return null;
  if (secretsCache && Date.now() - secretsCache.at < SECRETS_TTL_MS) return secretsCache.promise;
  const promise = docRef(db).get().then((snap) => (snap.data() ?? {}) as Record<string, EncryptedPayload>);
  // Never cache a failed read — one blip must not blind every secret lookup
  // for a full minute.
  promise.catch(() => { secretsCache = null; });
  secretsCache = { at: Date.now(), promise };
  return promise;
}

export function clearSecretsCache() {
  secretsCache = null;
}

/** Resolve a secret's live value: Firestore override first, then env var. Returns '' if neither set. */
export async function getSecret(key: SecretKey): Promise<string> {
  try {
    const stored = (await loadSecretsDoc())?.[key];
    if (stored?.ciphertext) return decryptSecret(stored);
  } catch (err) {
    // Decrypt failures are configuration drift (ENCRYPTION_KEY changed or a
    // corrupted payload) — say so loudly rather than quietly serving a stale
    // env value as if nothing were wrong.
    console.error(`[secrets] Failed to read/decrypt ${key} — falling back to process.env. Check ENCRYPTION_KEY:`, err);
  }
  return process.env[key] ?? '';
}

export async function setSecret(key: SecretKey, plaintext: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Firestore admin not configured');
  if (!plaintext) {
    await docRef(db).set({ [key]: FieldValue.delete() }, { merge: true });
    clearSecretsCache();
    return;
  }
  const payload = encryptSecret(plaintext);
  await docRef(db).set({ [key]: payload }, { merge: true });
  clearSecretsCache();
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
