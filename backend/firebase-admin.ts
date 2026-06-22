import * as admin from 'firebase-admin';

let initialized = false;

export function getAdminApp(): admin.app.App {
  if (!initialized && !admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is not set');

    const serviceAccount = JSON.parse(
      Buffer.from(raw, 'base64').toString('utf8')
    ) as admin.ServiceAccount;

    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
  }
  return admin.app();
}

export function getAdminFirestore() {
  return admin.firestore(getAdminApp());
}
