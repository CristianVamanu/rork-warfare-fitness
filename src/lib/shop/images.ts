import { createHash } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, r2PublicUrl } from '@/lib/r2';
import { getSecret } from '@/lib/secrets';

/**
 * Product images live on OUR storage, not the provider's.
 *
 * Gelato hands out preview URLs that are signed and time-limited; Printify's
 * are stable today but not promised. Imported once and stored as-is, the
 * shop showed broken-image icons a few hours later — the exact thing the
 * screenshot showed. So every import copies each image into R2 under a key
 * derived from the source URL, and the product stores the R2 URL. The same
 * source URL maps to the same key, so a re-import re-uses the copy instead
 * of uploading it again.
 *
 * If R2 is not configured, or a fetch fails, the original URL is kept:
 * a picture that may expire beats no picture.
 */

const MAX_BYTES = 8 * 1024 * 1024;

async function ourHost(): Promise<string | null> {
  try {
    const base = (await getSecret('R2_PUBLIC_URL')).replace(/\/$/, '');
    return base || null;
  } catch { return null; }
}

export async function isMirrored(url: string): Promise<boolean> {
  const base = await ourHost();
  return !!base && url.startsWith(`${base}/`);
}

function extFor(contentType: string, url: string): string {
  if (/png/.test(contentType)) return 'png';
  if (/webp/.test(contentType)) return 'webp';
  if (/gif/.test(contentType)) return 'gif';
  if (/jpe?g/.test(contentType)) return 'jpg';
  const m = url.split('?')[0].match(/\.(png|webp|gif|jpe?g)$/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

/** Signed URLs carry their expiry in the query; the path is the stable part. */
function stableId(url: string): string {
  const path = url.split('?')[0];
  return createHash('sha1').update(path).digest('hex').slice(0, 20);
}

export async function mirrorImage(url: string, folder: string): Promise<string | null> {
  const base = await ourHost();
  if (!base || url.startsWith(`${base}/`)) return url;
  const [client, bucket] = await Promise.all([getR2Client(), getSecret('R2_BUCKET_NAME').catch(() => '')]);
  if (!client || !bucket) return url;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'image/*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!contentType.startsWith('image/')) {
      // A link the harvester mistook for a picture (a design page, a JSON
      // endpoint). Dropping it beats a broken tile on the shelf.
      console.warn('[shop] not an image, dropped:', url.slice(0, 120), contentType || 'no type');
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) throw new Error(`size ${buf.length}`);
    const key = `shop/${folder}/${stableId(url)}.${extFor(contentType, url)}`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
    return r2PublicUrl(key);
  } catch (err) {
    console.warn('[shop] image mirror failed, keeping source URL:', url.slice(0, 120), err instanceof Error ? err.message : err);
    return url;
  }
}

/**
 * Mirrors a product's image list. `keep` is what the product already
 * stores: any of those that are already ours are re-used by position-free
 * identity (same source path → same key), so a refresh only fetches new
 * pictures.
 */
export async function mirrorImages(urls: string[], folder: string): Promise<string[]> {
  const out: string[] = [];
  for (const u of urls.slice(0, 12)) {
    if (!u || !/^https?:\/\//.test(u)) continue;
    const m = await mirrorImage(u, folder);
    if (m) out.push(m);
  }
  return Array.from(new Set(out));
}
