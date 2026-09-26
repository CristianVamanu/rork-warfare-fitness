export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-click unsubscribe. No login, no confirmation screen, no "are you
 * sure" — the link in the email IS the consent to stop, and making someone
 * work for it is how a business ends up with spam complaints instead of
 * unsubscribes.
 *
 * GET is what a person clicks. POST is what Gmail and Apple Mail send from
 * their own Unsubscribe button (RFC 8058 List-Unsubscribe-Post). Both do
 * the same thing.
 *
 * The token is an HMAC of the address (lib/emailSequences), so a link can
 * only ever unsubscribe the address it was sent to. Nothing about the
 * person is revealed: the page says the same thing whether or not the
 * address existed, and the address is not echoed back.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { verifyUnsubscribeToken, unsubscribeSecret, type UnsubscribeScope } from '@/lib/emailUnsubscribe';

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#0A0A0A;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}main{max-width:480px;margin:18vh auto;padding:0 24px}h1{font-size:22px;margin:0 0 12px}p{color:rgba(255,255,255,.65);line-height:1.5;font-size:15px}a{color:#F5A623}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function handle(req: NextRequest) {
  const limited = await rateLimit({ scope: 'unsubscribe', key: clientIp(req), windowMs: 60_000, max: 30 });
  if (!limited.allowed) return page('Too many requests', 'Try again in a minute.', 429);

  const url = new URL(req.url);
  const email = String(url.searchParams.get('e') ?? '').trim().toLowerCase();
  const scope = url.searchParams.get('s') as UnsubscribeScope | null;
  const token = url.searchParams.get('t') ?? '';
  const secret = unsubscribeSecret();

  if (!secret || !email || (scope !== 'lead' && scope !== 'user') || !verifyUnsubscribeToken(secret, email, scope, token)) {
    return page('That link is not valid', 'It may have been altered. Open the most recent email from us and use the unsubscribe link at the bottom.', 400);
  }

  const app = getAdminApp();
  if (!app) return page('Unsubscribed', 'You will not receive marketing email from us.');
  const db = getAdminDb(app);

  try {
    if (scope === 'lead') {
      const snap = await db.collection('landingLeads').where('email', '==', email).get();
      const batch = db.batch();
      // Stops the free-plan drip as well: a person who says stop is not
      // made to explain which emails they meant.
      snap.docs.forEach((d) => batch.update(d.ref, { marketingOptIn: false, dripActive: false, unsubscribedAt: FieldValue.serverTimestamp() }));
      if (!snap.empty) await batch.commit();
    } else {
      const snap = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!snap.empty) {
        await snap.docs[0].ref.update({ 'emailPrefs.marketing': false, 'emailPrefs.updatedAt': FieldValue.serverTimestamp() });
      }
    }
  } catch (err) {
    console.error('[unsubscribe] write failed:', err instanceof Error ? err.message : err);
    return page('Something went wrong', 'Please try the link again in a moment.', 500);
  }

  return page('Unsubscribed', 'You will not receive marketing email from us. Receipts and account notices still arrive, because they are about your account rather than about us.');
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
