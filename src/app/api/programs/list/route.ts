export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The in-app program browse list, without the workouts.
 *
 * The Training screen used to build this list by pulling the whole `programs`
 * collection straight into the browser. Every document carries its complete
 * `schedule` — a 12-week, 6-day program is 72 sessions, each with 4-6
 * exercises and their sets, reps, RPE, rest and coaching notes — plus
 * `phases` and `exercises`. The browse list renders a name, a level and a
 * goal. So a phone on mobile data was downloading several megabytes of rep
 * schemes to draw a handful of cards, which is why that screen sat on
 * skeletons for seconds.
 *
 * This returns every field EXCEPT those three. Stripping rather than
 * allow-listing is deliberate: the list, the filters and the cards read a
 * long tail of small fields (imageUrl, targetGender, trainerId, ownerId,
 * visibility, isPublic, createdAt...), and an allow-list would silently drop
 * whichever one someone adds next. The heavy fields are few, named, and
 * nothing in a list view can legitimately want them — opening a program
 * fetches its own document through resolveProgram().
 */

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthed } from '@/lib/verifyAdmin';

/** Big enough to be worth removing, and never read by a list view. */
const HEAVY_FIELDS = ['schedule', 'phases', 'exercises'] as const;

export async function GET(req: NextRequest) {
  const check = await verifyAuthed(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });

  try {
    const snap = await getAdminDb(app).collection('programs').get();

    const programs = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      for (const f of HEAVY_FIELDS) delete data[f];

      // getUserCustomPrograms sorts on `createdAt.seconds`. JSON.stringify
      // turns an admin Timestamp into {_seconds,_nanoseconds}, so the field
      // the client reads would arrive undefined and the sort would silently
      // become a no-op — the ordering bug that looks like "my newest program
      // is in the middle of the list" and gets blamed on anything but this.
      for (const [k, v] of Object.entries(data)) {
        if (v instanceof Timestamp) data[k] = { seconds: v.seconds, nanoseconds: v.nanoseconds };
      }
      return { id: d.id, ...data };
    });

    return NextResponse.json(
      { programs },
      // Private: the response includes non-public and personally-owned
      // programs, so it must never land in a shared cache. The client keeps
      // its own 30s cache on top of this.
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  } catch (err) {
    console.error('[programs/list] Error:', err);
    return NextResponse.json({ error: 'Could not load programs' }, { status: 500 });
  }
}
