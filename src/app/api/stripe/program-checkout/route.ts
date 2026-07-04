export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One-time purchase checkout for an individual program (alternative to membership gating). */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import type { Program } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { userId, userEmail, programId } = await req.json() as { userId: string; userEmail: string; programId: string };
    if (!userId || !programId) return NextResponse.json({ error: 'userId and programId required' }, { status: 400 });

    const app = getAdminApp();
    if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
    const db = getAdminDb(app);

    const progSnap = await db.collection('programs').doc(programId).get();
    if (!progSnap.exists) return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    const program = progSnap.data() as Program;
    if (!program.price || program.price <= 0) return NextResponse.json({ error: 'Program price not set' }, { status: 400 });

    const stripe = await getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: userEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(program.price * 100),
            product_data: { name: program.name },
          },
        },
      ],
      metadata: { userId, programId, kind: 'program_purchase' },
      success_url: `${appUrl}/training/${programId}?purchased=1`,
      cancel_url: `${appUrl}/training/${programId}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create program checkout session';
    console.error('[Stripe] program-checkout error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
