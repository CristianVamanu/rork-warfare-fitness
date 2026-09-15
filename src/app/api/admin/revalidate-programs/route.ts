export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Rebuilds the cached public program pages on demand.
 *
 * /programs and /programs/[slug] are statically rendered with a one-hour
 * revalidate window, which is right for a catalogue that changes rarely and
 * wrong for the moment it does change. Without this, deleting a program left
 * its public page serving a 200 — with a working "Start this program" button —
 * for up to an hour afterwards. Worse, for a built-in the seed copy still
 * lives in the bundle, so resolveProgram would happily enrol someone in the
 * program you had just deleted.
 *
 * Called by the admin panel after any create, update or delete. Deliberately
 * fire-and-forget at the call sites: a stale page for an hour is a small
 * problem, but a delete that fails because a cache purge failed is a worse one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyAdmin } from '@/lib/verifyAdmin';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  try {
    revalidatePath('/programs');
    // 'page' type rebuilds every slug under the dynamic segment, which is what
    // is wanted: a rename changes a program's slug, so purging only the slug
    // we were told about would leave the old URL cached and live.
    revalidatePath('/programs/[slug]', 'page');
    revalidatePath('/sitemap.xml');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/revalidate-programs] Failed:', err);
    return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 });
  }
}
