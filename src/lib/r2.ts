import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSecret } from '@/lib/secrets';

/**
 * Deletes every object under `prefix`. Used by account erasure: uploads go
 * to R2, not Firebase Storage, and erasure only ever cleaned the latter —
 * so a deleted member's support screenshots and body photos stayed publicly
 * reachable by URL indefinitely. Returns the number of objects removed.
 * Best-effort by design; the caller logs and continues.
 */
export async function deleteR2Prefix(prefix: string): Promise<number> {
  const client = await getR2Client();
  const bucket = await getSecret('R2_BUCKET_NAME');
  if (!client || !bucket) return 0;
  let removed = 0;
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
    if (keys.length) {
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
      removed += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return removed;
}

export async function getR2Client(): Promise<S3Client | null> {
  const [accountId, accessKeyId, secretAccessKey] = await Promise.all([
    getSecret('R2_ACCOUNT_ID'),
    getSecret('R2_ACCESS_KEY_ID'),
    getSecret('R2_SECRET_ACCESS_KEY'),
  ]);
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function r2PublicUrl(key: string): Promise<string> {
  const base = (await getSecret('R2_PUBLIC_URL')).replace(/\/$/, '');
  return `${base}/${key}`;
}
