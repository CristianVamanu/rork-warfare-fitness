/**
 * Set or remove Firebase custom claim { admin: true } for a user by email.
 *
 * Usage:
 *   npx ts-node -e "require('./scripts/set-admin').setAdmin('you@example.com')"
 *
 * Or add to package.json scripts:
 *   "set-admin": "ts-node scripts/set-admin.ts"
 * Then run:
 *   FIREBASE_SERVICE_ACCOUNT_KEY=<base64> npx ts-node scripts/set-admin.ts you@example.com
 *
 * The FIREBASE_SERVICE_ACCOUNT_KEY env var must be the base64-encoded service account JSON.
 * Download it from Firebase Console → Project Settings → Service Accounts → Generate new key.
 * Encode it: base64 -i serviceAccount.json | tr -d '\n'
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is not set');
  const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  return initializeApp({ credential: cert(serviceAccount) });
}

export async function setAdmin(email: string, isAdmin = true): Promise<void> {
  const app = getAdminApp();
  const auth = getAuth(app);

  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { admin: isAdmin });

  console.log(`✅ Custom claim { admin: ${isAdmin} } set for ${email} (uid: ${user.uid})`);
  console.log('   The user must sign out and sign back in (or call getIdToken(true)) for the claim to take effect.');
}

export async function removeAdmin(email: string): Promise<void> {
  return setAdmin(email, false);
}

// Run directly: ts-node scripts/set-admin.ts <email> [--remove]
if (require.main === module) {
  const email = process.argv[2];
  const remove = process.argv.includes('--remove');
  if (!email) {
    console.error('Usage: ts-node scripts/set-admin.ts <email> [--remove]');
    process.exit(1);
  }
  (remove ? removeAdmin(email) : setAdmin(email))
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
