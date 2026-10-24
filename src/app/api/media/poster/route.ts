export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Makes a poster frame for a clip the caller has already uploaded.
 *
 * Called right after the upload finishes and before the post is sent, so the
 * poster is attached to the post like any other field. Best-effort on purpose:
 * every failure answers 200 with `posterUrl: null` rather than an error status,
 * because a clip with no poster is a worse thumbnail, not a failed upload, and
 * the caller should not have to tell those apart.
 *
 * The clip must live under the caller's own folder in our bucket. That check
 * is doing two jobs: it stops this from fetching arbitrary URLs on request,
 * and it stops one member minting posters from another member's uploads.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { rateLimit } from '@/lib/rateLimit';
import { getR2Client, r2PublicUrl } from '@/lib/r2';
import { getSecret } from '@/lib/secrets';
import { generatePoster, isOwnBucketUrl } from '@/lib/videoPoster';

/** `<root>/<uid>/<name>` out of a public bucket URL, or null if it is not that shape. */
function ownerOf(videoUrl: string, publicBase: string): { root: string; uid: string } | null {
  if (!isOwnBucketUrl(videoUrl, publicBase)) return null;
  const basePath = new URL(publicBase).pathname.replace(/\/$/, '');
  const rest = new URL(videoUrl).pathname.slice(basePath.length + 1);
  const [root, uid] = rest.split('/');
  if (!root || !uid) return null;
  return { root, uid };
}

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAuthed(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    // One poster per upload, and uploads are already capped at sixty an hour,
    // so this matches rather than adds a second, tighter ceiling that would
    // bite first on a legitimate session.
    const limit = await rateLimit({ scope: 'media-poster', key: check.uid, windowMs: 60 * 60_000, max: 60 });
    if (!limit.allowed) {
      return NextResponse.json({ posterUrl: null, reason: 'rate-limited' }, { status: 200 });
    }

    const { videoUrl } = await req.json();
    if (!videoUrl || typeof videoUrl !== 'string') {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }

    const publicBase = await getSecret('R2_PUBLIC_URL');
    const owner = ownerOf(videoUrl, publicBase);
    if (!owner || owner.uid !== check.uid) {
      return NextResponse.json({ error: 'That clip is not yours' }, { status: 403 });
    }

    const result = await generatePoster(videoUrl);
    if (!result.ok) {
      return NextResponse.json({ posterUrl: null, reason: result.reason }, { status: 200 });
    }

    const client = await getR2Client();
    const bucket = await getSecret('R2_BUCKET_NAME');
    if (!client || !bucket) return NextResponse.json({ posterUrl: null, reason: 'no-bucket' }, { status: 200 });

    // Same folder as the clip it belongs to. Account erasure deletes by the
    // `<root>/<uid>/` prefix, so a poster written anywhere else would outlive
    // the member who uploaded it.
    const key = `${owner.root}/${owner.uid}/${Date.now()}_${crypto.randomBytes(16).toString('hex')}_poster.jpg`;
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: result.jpeg,
      ContentType: 'image/jpeg',
      ContentLength: result.jpeg.length,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    return NextResponse.json({ posterUrl: await r2PublicUrl(key) });
  } catch {
    // Including a clip ffmpeg could not open at all. The caller treats a null
    // poster and a failed call identically, so there is nothing useful to say.
    return NextResponse.json({ posterUrl: null, reason: 'error' }, { status: 200 });
  }
}
