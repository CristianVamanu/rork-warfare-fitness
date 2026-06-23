/**
 * Logs Firebase env var presence to the browser console at runtime (client-side).
 * Renders nothing — pure side-effect component. Mount once near the app root.
 * Remove or tree-shake after diagnosing the Vercel env injection issue.
 */
import { useEffect } from 'react';

export default function FirebaseDiagnostic() {
  useEffect(() => {
    const vars = {
      NEXT_PUBLIC_FIREBASE_API_KEY:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      NEXT_PUBLIC_FIREBASE_APP_ID:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    console.group('[FirebaseDiagnostic] CLIENT-SIDE env check');
    console.log('NODE_ENV       :', process.env.NODE_ENV);
    console.log('window.location:', typeof window !== 'undefined' ? window.location.href : 'N/A (SSR)');
    console.log('');
    Object.entries(vars).forEach(([key, val]) => {
      console.log(`  ${key.padEnd(45)} = ${val ? '✓ set' : '✗ MISSING'}`);
    });

    const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length === 0) {
      console.log('');
      console.log('✅ All Firebase env vars present at CLIENT runtime.');
      console.log('   If Firebase still fails, the issue is in initialization code, not env injection.');
    } else {
      console.error('');
      console.error('❌ MISSING Firebase env vars at CLIENT runtime:', missing);
      console.error('');
      console.error('Diagnosis checklist:');
      console.error('  1. Are these vars added in Vercel → Project Settings → Environment Variables?');
      console.error('  2. Are they scoped to the correct Environment (Production / Preview / Development)?');
      console.error('  3. Was the deployment triggered AFTER the vars were saved? (Vercel requires a new deploy)');
      console.error('  4. Are you viewing a cached/old deployment? Check the deployment URL in Vercel dashboard.');
      console.error('  5. Is NEXT_PUBLIC_ the exact prefix? (not EXPO_PUBLIC_, not REACT_APP_, not plain FIREBASE_)');
    }

    // Also fetch /api/health and log server-side Firebase status for comparison
    fetch('/api/health')
      .then(r => r.json())
      .then((data: any) => {
        console.log('');
        console.log('[FirebaseDiagnostic] SERVER-SIDE firebase env (from /api/health):');
        console.log('  nodeEnv                  :', data.nodeEnv);
        console.log('  firebaseKeysFoundInEnv   :', data.firebaseKeysFoundInProcessEnv);
        Object.entries((data.firebase ?? {}) as Record<string, string>).forEach(([k, v]) => {
          console.log(`  ${k.padEnd(45)} = ${v}`);
        });
        const serverMissing = Object.entries((data.firebase ?? {}) as Record<string, string>)
          .filter(([, v]) => (v as string).startsWith('✗')).map(([k]) => k);
        if (serverMissing.length === 0) {
          console.log('  ✅ All Firebase vars present server-side.');
          if (missing.length > 0) {
            console.error('  ⚠️  MISMATCH: vars exist server-side but NOT client-side.');
            console.error('     Likely cause: vars not prefixed with NEXT_PUBLIC_ (required for client bundle injection).');
          }
        } else {
          console.error('  ❌ Missing server-side too — vars are simply not set in this Vercel project/environment.');
        }
      })
      .catch(e => console.warn('[FirebaseDiagnostic] /api/health fetch failed:', e));

    console.groupEnd();
  }, []);

  return null;
}
