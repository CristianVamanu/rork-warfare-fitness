import { describe, it, expect } from 'vitest';
import { buildAssetLinks, GET } from './route';

const FP1 = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
const FP2 = '11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00';

describe('Digital Asset Links', () => {
  it('is an empty list when no fingerprint is configured', () => {
    expect(buildAssetLinks({})).toEqual([]);
  });

  it('lists every configured fingerprint under the package name', () => {
    const out = buildAssetLinks({ ANDROID_PACKAGE_NAME: 'com.example.app', ANDROID_SHA256_FINGERPRINTS: `${FP1}, ${FP2}` });
    expect(out).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'com.example.app', sha256_cert_fingerprints: [FP1, FP2] },
      },
    ]);
  });

  it('upper-cases and drops anything that is not a SHA-256 fingerprint', () => {
    const out = buildAssetLinks({ ANDROID_SHA256_FINGERPRINTS: `${FP1.toLowerCase()},not-a-fingerprint,AA:BB` });
    expect(out[0].target.sha256_cert_fingerprints).toEqual([FP1]);
    expect(out[0].target.package_name).toBe('com.warfarefitness.app');
  });

  it('serves JSON with a short cache', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toContain('max-age=300');
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
