export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { sendEmail, coachingApplicationEmailHtml } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const check = await verifyAdmin(req);
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

    const { applicationId } = await req.json() as { applicationId: string };
    if (!applicationId) return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
    const db = getAdminDb(app);

    const appSnap = await db.collection('coachingApplications').doc(applicationId).get();
    const application = appSnap.data();
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    if (application.status !== 'approved' && application.status !== 'rejected') {
      return NextResponse.json({ ok: false, reason: 'Application is not in a decided state' });
    }
    if (!application.userEmail) return NextResponse.json({ ok: false, reason: 'No email on file' });

    const cfgSnap = await db.collection('system').doc('config').get();
    const appName = (cfgSnap.data()?.appName as string) || 'Warfare Fitness';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://warfarefitness.com';

    const sent = await sendEmail({
      to: application.userEmail,
      subject: application.status === 'approved' ? "You're approved for 1:1 Coaching!" : '1:1 Coaching Application Update',
      html: coachingApplicationEmailHtml(
        (application.userName as string)?.split(' ')[0] || 'there',
        application.status,
        application.planName ?? '',
        application.rejectionReason,
        appName,
        appUrl,
      ),
    });

    return NextResponse.json({ ok: sent });
  } catch (err) {
    console.error('[email/coaching-status] Error:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
