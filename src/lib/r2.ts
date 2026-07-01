import { S3Client } from '@aws-sdk/client-s3';
import { getSecret } from '@/lib/secrets';

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
