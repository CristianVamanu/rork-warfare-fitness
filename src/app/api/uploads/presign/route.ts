export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authed-user presign — issues a presigned PUT URL for uploading directly to
 * Cloudflare R2 from the browser (no egress fees, unlike Firebase Storage).
 * Unlike /api/admin/r2-presign, this is open to any signed-in user, but the
 * folder is forced under their own uid so nobody can write into another
 * user's path or an admin-only folder (exerciseLibrary, branding).
 */

import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifyAuthed } from '@/lib/verifyAdmin';
import { getR2Client, r2PublicUrl } from '@/lib/r2';
import { getSecret } from '@/lib/secrets';

const ALLOWED_ROOTS = ['prPosts', 'progressPhotos', 'community'];

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAuthed(req);
    if ('error' in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const client = await getR2Client();
    const bucket = await getSecret('R2_BUCKET_NAME');
    if (!client || !bucket) {
      return NextResponse.json({ error: 'R2 not configured' }, { status: 500 });
    }

    const { filename, contentType, root } = await req.json();
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 });
    }

    const safeRoot = typeof root === 'string' && ALLOWED_ROOTS.includes(root) ? root : ALLOWED_ROOTS[0];
    const safeName = filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const key = `${safeRoot}/${check.uid}/${Date.now()}_${safeName}`;

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
