/**
 * Digital Asset Links body for the Android app. Kept out of the route file
 * because Next.js rejects any non-HTTP export from a route module at build
 * time, and the tests need to call this directly.
 */
const DEFAULT_PACKAGE = 'com.warfarefitness.app';
const FINGERPRINT_RE = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;

type AssetLinksEnv = { ANDROID_PACKAGE_NAME?: string; ANDROID_SHA256_FINGERPRINTS?: string } & Record<string, string | undefined>;

export function buildAssetLinks(env: AssetLinksEnv) {
  const packageName = (env.ANDROID_PACKAGE_NAME || DEFAULT_PACKAGE).trim();
  const fingerprints = (env.ANDROID_SHA256_FINGERPRINTS || '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter((f) => FINGERPRINT_RE.test(f));
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
