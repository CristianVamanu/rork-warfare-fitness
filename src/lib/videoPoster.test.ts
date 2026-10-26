import { describe, it, expect } from 'vitest';
import { isOwnBucketUrl } from './videoPoster';

/**
 * This check is the only thing standing between a signed-in member and an
 * endpoint that fetches whatever URL they name, from inside the network, as
 * the server. The cases below are the ways a naive version of it gets past:
 * a hostname that merely starts with the real one, a redirect to plain http,
 * a userinfo section that makes the real host look like the prefix.
 */
const BASE = 'https://media.warfarefitness.com';

describe('isOwnBucketUrl', () => {
  it('accepts a real object in the bucket', () => {
    expect(isOwnBucketUrl(`${BASE}/community/uid123/1700_abc_clip.mp4`, BASE)).toBe(true);
  });

  it('accepts when the configured base carries a trailing slash', () => {
    expect(isOwnBucketUrl(`${BASE}/community/uid123/clip.mp4`, `${BASE}/`)).toBe(true);
  });

  it('rejects a different host', () => {
    expect(isOwnBucketUrl('https://evil.test/community/uid123/clip.mp4', BASE)).toBe(false);
  });

  it('rejects a host that merely begins with the base', () => {
    // The startsWith version of this check passes this URL.
    expect(isOwnBucketUrl('https://media.warfarefitness.com.evil.test/x.mp4', BASE)).toBe(false);
  });

  it('rejects userinfo dressed up to look like the base', () => {
    expect(isOwnBucketUrl('https://media.warfarefitness.com@evil.test/x.mp4', BASE)).toBe(false);
  });

  it('rejects plain http, including to the right host', () => {
    expect(isOwnBucketUrl('http://media.warfarefitness.com/community/uid/clip.mp4', BASE)).toBe(false);
  });

  it('rejects the cloud metadata service', () => {
    expect(isOwnBucketUrl('http://169.254.169.254/latest/meta-data/', BASE)).toBe(false);
  });

  it('rejects the app talking to itself', () => {
    expect(isOwnBucketUrl('http://localhost:3000/api/admin/backup', BASE)).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(isOwnBucketUrl('file:///etc/passwd', BASE)).toBe(false);
    expect(isOwnBucketUrl('data:video/mp4;base64,AAAA', BASE)).toBe(false);
  });

  it('rejects anything that is not a URL', () => {
    expect(isOwnBucketUrl('not a url', BASE)).toBe(false);
    expect(isOwnBucketUrl('', BASE)).toBe(false);
  });

  it('rejects every URL when the bucket base is unconfigured', () => {
    // getSecret returns '' for a key that was never set. An empty base must
    // not turn into "everything matches".
    expect(isOwnBucketUrl(`${BASE}/community/uid/clip.mp4`, '')).toBe(false);
  });

  it('honours a path prefix in the base', () => {
    const scoped = 'https://cdn.example.com/warfare';
    expect(isOwnBucketUrl('https://cdn.example.com/warfare/community/uid/clip.mp4', scoped)).toBe(true);
    expect(isOwnBucketUrl('https://cdn.example.com/other/community/uid/clip.mp4', scoped)).toBe(false);
  });
});
