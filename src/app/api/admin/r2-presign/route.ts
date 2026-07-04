export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only: issues a presigned PUT URL for uploading a file directly to
 * Cloudflare R2 from the browser. R2 has no egress fees, unlike Firebase Storage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getR2Client, r2PublicUrl } from '@/lib/r2';
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

    const { filename, contentType, folder } = await req.json();
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 });
    }

    const safeFolder = typeof folder === 'string' && folder ? folder.replace(/[^a-zA-Z0-9_-]/g, '') : 'exerciseLibrary';
    const safeName = filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const key = `${safeFolder}/${Date.now()}_${safeName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });

    return NextResponse.json({
      uploadUrl,
      key,
      publicUrl: await r2PublicUrl(key),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
