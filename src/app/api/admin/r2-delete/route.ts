export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only: deletes an object from Cloudflare R2 by its public URL.
 * Companion to r2-presign — used to clean up replaced/removed exercise
 * videos and thumbnails instead of leaving orphaned files billing forever.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getR2Client } from '@/lib/r2';
import { getSecret } from '@/lib/secrets';

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAdmin(req);
    if ('error' in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const client = await getR2Client();
    const bucket = await getSecret('R2_BUCKET_NAME');
    if (!client || !bucket) {
      return NextResponse.json({ error: 'R2 not configured' }, { status: 500 });
    }

    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const base = (await getSecret('R2_PUBLIC_URL')).replace(/\/$/, '');
    if (!base || !url.startsWith(`${base}/`)) {
      // Not an R2 URL (e.g. Firebase Storage) — nothing for this route to do.
      return NextResponse.json({ skipped: true });
    }
    const key = url.slice(base.length + 1);

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
