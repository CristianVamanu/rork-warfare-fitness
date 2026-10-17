import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'crypto';

/**
 * AES-256-GCM encryption for third-party API keys stored in Firestore.
 * The master key (ENCRYPTION_KEY) lives only in the hosting platform's env vars,
 * never in the database — so a full Firestore leak yields only ciphertext.
 */

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is not set on the server');
  // Accept any length input and derive a stable 32-byte key from it.
  return createHash('sha256').update(raw).digest();
}

export interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = getMasterKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return '••••';
  return `••••${plaintext.slice(-4)}`;
}

/**
 * Constant-time string comparison for auth secrets (cron tokens, webhook
 * headers) — a plain `===` short-circuits on the first mismatched byte,
 * which leaks a (low-practicality but nonzero) timing side-channel over the
 * network. timingSafeEqual requires equal-length buffers, so the length
 * check itself must also not branch on content — comparing against a
 * same-length buffer of the expected value when lengths differ keeps the
 * whole function's timing independent of how much of `provided` matched.
 */
export function timingSafeEqualString(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    timingSafeEqual(providedBuf, providedBuf);
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}
