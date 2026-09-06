export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily email digest of unresolved client errors.
 *
 * /api/client-error captures errors and /api/admin/errors lists them, but
 * nothing told anyone they existed — you had to go and look. With paying
 * members that is the wrong way round: you want to hear about a broken
 * checkout within the hour, not when someone emails to complain.
 *
 * Deliberately a digest rather than an alert per error. One email a day that
 * gets read beats fifty that get filtered, and a browser stuck in a loop
 * would otherwise mail you fifty times about the same fault. Sends nothing
 * at all when there is nothing new — silence should mean silence.
 *
 * Cron-authenticated the same way as the other scheduled jobs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { timingSafeEqualString } from '@/lib/crypto';
import { sendEmail } from '@/lib/email';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const viaCron = !!cronSecret && !!authHeader && timingSafeEqualString(authHeader, `Bearer ${cronSecret}`);
  if (!viaCron) {
    const check = await verifyAdmin(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const snap = await db.collection('errorReports')
      .where('resolved', '==', false)
      .orderBy('lastSeenAt', 'desc')
      .limit(25)
      .get();

    const recent = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          message: (x.message as string) ?? '',
          count: (x.count as number) ?? 0,
          lastUrl: (x.lastUrl as string) ?? null,
          lastSeenMs: (x.lastSeenAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
        };
      })
      .filter((e) => e.lastSeenMs >= since);

    // Nothing new — send nothing. A daily "all clear" trains you to ignore
    // the sender, which is exactly what you must not do with this one.
    if (recent.length === 0) return NextResponse.json({ ok: true, sent: false, groups: 0 });

    const [cfgSnap, adminSnap] = await Promise.all([
      db.collection('system').doc('config').get(),
      db.collection('users').where('role', '==', 'admin').limit(5).get(),
    ]);
    const appName = (cfgSnap.data()?.appName as string) || 'Warfare Fitness';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';
    const recipients = adminSnap.docs.map((d) => d.data().email as string | undefined).filter((e): e is string => !!e);

    if (recipients.length === 0) {
      console.error('[error-digest] No admin email on file — digest not sent');
      return NextResponse.json({ ok: true, sent: false, reason: 'no admin email' });
    }

    const totalHits = recent.reduce((n, e) => n + e.count, 0);
    const rows = recent.map((e) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #222;color:#fff;font-size:13px;">${escapeHtml(e.message).slice(0, 200)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #222;color:#F5A623;font-size:13px;text-align:right;white-space:nowrap;">${e.count}×</td>
        <td style="padding:8px 10px;border-bottom:1px solid #222;color:#888;font-size:12px;">${escapeHtml(e.lastUrl ?? '—')}</td>
      </tr>`).join('');

    const html = `
      <div style="background:#0a0a0a;padding:32px 16px;font-family:-apple-system,Segoe UI,sans-serif;">
        <div style="max-width:640px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#F5A623;">${escapeHtml(appName)}</p>
          <h2 style="margin:0 0 4px;color:#fff;font-size:18px;">${recent.length} unresolved error${recent.length === 1 ? '' : 's'} in the last 24h</h2>
          <p style="margin:0 0 18px;color:#888;font-size:13px;">${totalHits} total occurrence${totalHits === 1 ? '' : 's'}. Most frequent first.</p>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
          <p style="margin:20px 0 0;font-size:12px;color:#666;">
            Resolve them from the admin panel, or with a POST to ${escapeHtml(appUrl)}/api/admin/errors.
          </p>
        </div>
      </div>`;

    let sent = 0;
    for (const to of recipients) {
      if (await sendEmail({ to, subject: `${recent.length} unresolved error${recent.length === 1 ? '' : 's'} — ${appName}`, html })) sent++;
    }

    if (sent === 0) console.error('[error-digest] Digest could not be delivered — check RESEND_API_KEY');
    return NextResponse.json({ ok: true, sent: sent > 0, groups: recent.length, recipients: sent });
  } catch (err) {
    // The composite index (resolved, lastSeenAt) is the likely cause — the
    // same one /api/admin/errors needs.
    console.error('[error-digest] Failed:', err);
    return NextResponse.json({ error: 'Digest failed' }, { status: 500 });
  }
}
