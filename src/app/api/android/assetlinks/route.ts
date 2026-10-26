import { NextResponse } from 'next/server';
import { buildAssetLinks } from '@/lib/assetLinks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Digital Asset Links for the Android app.
 *
 * The Play Store app is a Trusted Web Activity: a thin Android shell that
 * opens warfarefitness.com full screen, with no browser chrome, as long as
 * the site vouches for the app. The site vouches by serving this file at
 * /.well-known/assetlinks.json (next.config.js rewrites that path here).
 * If the file is missing, or the fingerprint does not match the key that
 * signed the installed APK, Android shows the site inside a Chrome Custom
 * Tab with a URL bar instead — it still works, it just looks like a
 * browser.
 *
 * Two fingerprints are normally needed and both go in the same list:
 *   - the upload key you (or PWABuilder / Bubblewrap) signed the bundle with,
 *     for local installs and internal testing;
 *   - the Play App Signing key Google re-signs with for production, from
 *     Play Console → Test and release → Setup → App signing.
 *
 * Both values come from the environment so the deploy never has to change
 * when a key is rotated:
 *   ANDROID_PACKAGE_NAME         e.g. com.warfarefitness.app
 *   ANDROID_SHA256_FINGERPRINTS  comma-separated, colon-separated hex pairs
 *
 * With no fingerprints configured the response is an empty list, which is
 * valid JSON that verifies nothing — the honest state, rather than a 404
 * that a crawler would cache as "no file here".
 */

export async function GET() {
  const body = buildAssetLinks(process.env);
  return NextResponse.json(body, {
    headers: {
      // Google's verifier fetches this on install and periodically after;
      // a short cache keeps a fingerprint rotation from taking a day to land.
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'application/json',
    },
  });
}
