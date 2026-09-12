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

// Same protections as the member-facing /api/uploads/presign — this route
// had none at all (any content-type, no size cap), even though it writes
// into the exerciseLibrary/branding paths of the same public-facing bucket
// that route deliberately locks down for exactly this reason (an SVG with
// an embedded <script> served back as active content from a public bucket).
const ALLOWED_CONTENT_TYPE = /^(image|video)\//;
const DISALLOWED_CONTENT_TYPE = /^image\/svg\+xml$/i;
const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200MB — covers a real exercise-demo video

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

    const { filename, contentType, folder, sizeBytes } = await req.json();
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 });
    }
    if (!contentType || typeof contentType !== 'string' || !ALLOWED_CONTENT_TYPE.test(contentType) || DISALLOWED_CONTENT_TYPE.test(contentType)) {
      return NextResponse.json({ error: 'Only image or video uploads are allowed' }, { status: 400 });
    }
    if (typeof sizeBytes !== 'number' || sizeBytes <= 0 || sizeBytes > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `File must be under ${MAX_SIZE_BYTES / (1024 * 1024)}MB` }, { status: 400 });
    }

    const safeFolder = typeof folder === 'string' && folder ? folder.replace(/[^a-zA-Z0-9_-]/g, '') : 'exerciseLibrary';
    const safeName = filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const key = `${safeFolder}/${Date.now()}_${safeName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      // R2/S3 rejects the actual PUT if its real body size doesn't match —
      // this is what makes the sizeBytes check above load-bearing.
      ContentLength: sizeBytes,
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
