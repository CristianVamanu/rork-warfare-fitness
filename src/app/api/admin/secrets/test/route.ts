export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getStorage } from 'firebase-admin/storage';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getSecret } from '@/lib/secrets';
import { getAdminApp } from '@/lib/firebase-admin';

type Service = 'openai' | 'stripe' | 'r2' | 'vapid' | 'firebase-storage' | 'cloudflare-analytics' | 'resend' | 'whoop';

async function testOpenAI(): Promise<string> {
  const key = await getSecret('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenAI responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return 'Connected to OpenAI';
}

async function testStripe(): Promise<string> {
  const key = await getSecret('STRIPE_SECRET_KEY');
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  const res = await fetch('https://api.stripe.com/v1/balance', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Stripe responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return 'Connected to Stripe';
}

async function testR2(): Promise<string> {
  const [accountId, accessKeyId, secretAccessKey, bucket] = await Promise.all([
    getSecret('R2_ACCOUNT_ID'),
    getSecret('R2_ACCESS_KEY_ID'),
    getSecret('R2_SECRET_ACCESS_KEY'),
    getSecret('R2_BUCKET_NAME'),
  ]);
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 credentials incomplete');
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  return `Connected to R2 bucket "${bucket}"`;
}

async function testVapid(): Promise<string> {
  const [pub, priv] = await Promise.all([
    getSecret('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    getSecret('VAPID_PRIVATE_KEY'),
  ]);
  if (!pub || !priv) throw new Error('VAPID keys not configured');
  const webpush = await import('web-push');
  try {
    webpush.default.setVapidDetails('mailto:admin@example.com', pub, priv);
  } catch (err) {
    throw new Error(`Invalid VAPID key pair: ${err instanceof Error ? err.message : err}`);
  }
  return 'VAPID key pair is valid';
}

async function testFirebaseStorage(): Promise<string> {
  const app = getAdminApp();
  if (!app) throw new Error('Firebase Admin not configured');
  const bucket = getStorage(app).bucket();
  const [exists] = await bucket.exists();
  if (!exists) throw new Error(`Bucket "${bucket.name}" not found or inaccessible`);
  return `Connected to Firebase Storage bucket "${bucket.name}"`;
}

async function testResend(): Promise<string> {
  const key = await getSecret('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY not configured');
  const res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return 'Connected to Resend';
}

async function testCloudflareAnalytics(): Promise<string> {
  const [token, zoneId] = await Promise.all([
    getSecret('CLOUDFLARE_API_TOKEN'),
    getSecret('CLOUDFLARE_ZONE_ID'),
  ]);
  if (!token || !zoneId) throw new Error('Cloudflare API token or Zone ID not configured');
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message || `Cloudflare responded ${res.status}`);
  }
  return `Connected to Cloudflare zone "${data.result?.name}"`;
}

// WHOOP's OAuth app doesn't support a client-credentials grant, so there's
// no server-to-server call that proves the id/secret pair actually works —
// WHOOP only validates them the moment a real user completes the consent
// screen. This just confirms both values were saved and the auth endpoint
// itself is reachable, and says so plainly rather than claiming a full test.
async function testWhoop(): Promise<string> {
  const [clientId, clientSecret] = await Promise.all([
    getSecret('WHOOP_CLIENT_ID'),
    getSecret('WHOOP_CLIENT_SECRET'),
  ]);
  if (!clientId || !clientSecret) throw new Error('WHOOP_CLIENT_ID or WHOOP_CLIENT_SECRET not configured');
  const res = await fetch('https://api.prod.whoop.com/oauth/oauth2/auth', { method: 'HEAD' }).catch(() => null);
  if (!res) throw new Error('Could not reach WHOOP — check your network/firewall');
  return 'Client ID/Secret saved. WHOOP has no server-side test — full validation happens the first time a user connects via Settings.';
}

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const { service } = await req.json() as { service: Service };
  try {
    let message: string;
    switch (service) {
      case 'openai': message = await testOpenAI(); break;
      case 'stripe': message = await testStripe(); break;
      case 'r2': message = await testR2(); break;
      case 'vapid': message = await testVapid(); break;
      case 'firebase-storage': message = await testFirebaseStorage(); break;
      case 'cloudflare-analytics': message = await testCloudflareAnalytics(); break;
      case 'resend': message = await testResend(); break;
      case 'whoop': message = await testWhoop(); break;
      default: return NextResponse.json({ error: 'Unknown service' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
