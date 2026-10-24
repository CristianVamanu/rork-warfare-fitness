export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Send me a test": the real rendered email for one sequence step, with the
 * admin's saved edits applied, delivered to the signed-in admin's own
 * address. Not to an address in the request — an admin route that emails
 * arbitrary addresses is a relay, and a test does not need one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, marketingEmailHtml } from '@/lib/email';
import { resolveSequences, SEQUENCES, sequenceToggles, type SequenceKey, type SequenceOverrides } from '@/lib/emailSequences';
import { unsubscribeUrl, unsubscribeSecret } from '@/lib/emailUnsubscribe';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  const { seq, step } = await req.json().catch(() => ({})) as { seq?: string; step?: string };
  if (!seq || !(seq in SEQUENCES) || !step) return NextResponse.json({ error: 'seq and step are required' }, { status: 400 });

  try {
    const db = getAdminDb(app);
    const [cfgSnap, ovSnap, authUser] = await Promise.all([
      db.doc('system/config').get(),
      db.doc('system/emailOverrides').get(),
      getAuth(app).getUser(check.uid),
    ]);
    const to = authUser.email;
    if (!to) return NextResponse.json({ error: 'Your admin account has no email address' }, { status: 400 });

    const cfg = cfgSnap.data() ?? {};
    const key = seq as SequenceKey;
    const overrides = (ovSnap.data() ?? {}) as SequenceOverrides;
    // A disabled step is still previewable: resolve with that one step
    // forced on, so the admin sees exactly what would go out if enabled.
    const forcedOn: SequenceOverrides = {
      ...overrides,
      [key]: { ...(overrides[key] ?? {}), steps: { ...(overrides[key]?.steps ?? {}), [step]: { ...(overrides[key]?.steps?.[step] ?? {}), enabled: true } } },
    };
    const stepDef = resolveSequences(forcedOn, sequenceToggles(cfg as { emailSequences?: Record<string, boolean> }))[key].steps.find((s) => s.key === step);
    if (!stepDef) return NextResponse.json({ error: 'Unknown step' }, { status: 400 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
    const brand = { name: (cfg.appName as string) || 'Warfare Fitness', logoUrl: (cfg.logoUrl as string) || null };
    const secret = unsubscribeSecret();
    const unsub = secret ? unsubscribeUrl(appUrl, secret, to, 'user') : `${appUrl}/settings`;

    const ok = await sendEmail({
      to,
      subject: `[TEST] ${stepDef.subject}`,
      unsubscribeUrl: unsub,
      html: marketingEmailHtml({ brand, appUrl, heading: stepDef.heading, paragraphs: stepDef.paragraphs, cta: stepDef.cta, unsubscribeUrl: unsub, name: authUser.displayName?.split(' ')[0] }),
    });
    if (!ok) return NextResponse.json({ error: 'The email service refused the send — check Resend in Integrations' }, { status: 502 });
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    console.error('[admin/email-test]', err);
    return NextResponse.json({ error: 'Failed to send test' }, { status: 500 });
  }
}
