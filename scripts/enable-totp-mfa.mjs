#!/usr/bin/env node
/**
 * Enables TOTP (authenticator-app) multi-factor authentication on the
 * Firebase project. One-time. Run on the VPS where .env.production lives:
 *
 *   node scripts/enable-totp-mfa.mjs
 *
 * Prerequisite: the Firebase project must be upgraded to Identity Platform
 * (Firebase Console → Authentication → the "Upgrade to Identity Platform"
 * banner, or Google Cloud Console → Identity Platform → Enable). Without
 * that, this call fails with a clear permission/config error and nothing
 * changes. TOTP is a project-level provider config that the Firebase
 * Console does not expose for every project, which is why this is a script
 * rather than a console step.
 *
 * Reads the same FIREBASE_* variables src/lib/firebase-admin.ts uses.
 * Idempotent: re-running just re-asserts the same config.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Minimal .env loader (no dotenv dependency): .env.production, then .env.
for (const file of ['.env.production', '.env']) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
  break;
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in the environment or .env.production');
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const mgr = getAuth(app).projectConfigManager();

try {
  const before = await mgr.getProjectConfig();
  console.log('Current MFA config:', JSON.stringify(before.multiFactorConfig ?? null));

  const after = await mgr.updateProjectConfig({
    multiFactorConfig: {
      // 'ENABLED' means enrolment is optional per user (what we want).
      // 'MANDATORY' would force every account to enrol at next sign-in.
      state: 'ENABLED',
      providerConfigs: [
        {
          state: 'ENABLED',
          // How many 30-second windows either side of "now" a code is
          // accepted for — tolerates modest clock drift on the phone.
          totpProviderConfig: { adjacentIntervals: 5 },
        },
      ],
    },
  });
  console.log('Updated MFA config:', JSON.stringify(after.multiFactorConfig ?? null));
  console.log('\nTOTP MFA is enabled. Users can now set up an authenticator app under Settings → Security.');
} catch (err) {
  const msg = err?.errorInfo?.message || err?.message || String(err);
  console.error('\nFailed to enable TOTP MFA:', msg);
  if (/identity platform|not enabled|PERMISSION_DENIED|CONFIGURATION_NOT_FOUND/i.test(msg)) {
    console.error('→ Upgrade the project to Identity Platform first (Firebase Console → Authentication → "Upgrade to Identity Platform"), then re-run.');
  }
  process.exit(1);
}
