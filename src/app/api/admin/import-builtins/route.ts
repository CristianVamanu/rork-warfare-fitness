export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One-time: copy the built-in programs into Firestore and hand control of
 * them to the admin panel for good.
 *
 * The built-ins ship inside the app bundle as seed data. That is why deleting
 * one could never truly remove it — the browser downloads all of them either
 * way, and "delete" could only ever mean "record an id somewhere and filter
 * it out on render". Hence the tombstone lists, and hence a program that was
 * deleted still being downloaded, parsed and then hidden.
 *
 * After this runs, every program is an ordinary Firestore document:
 *
 *   - Delete actually deletes the document. Nothing to suppress.
 *   - `system/config.builtinsImported` flips to true, and every list stops
 *     merging the bundled copies entirely — so a deleted program is not
 *     loaded, not filtered, not anything.
 *   - Editing a program is a normal write instead of a promotion.
 *
 * Programs an admin already deleted are NOT imported: they stay gone. The
 * point of this is to stop the bundle being a second, unmanageable source of
 * programs, not to resurrect anything.
 *
 * Idempotent: a program already in Firestore is left exactly as it is, so
 * running this twice cannot overwrite an admin's edits with the seed copy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { MOCK_PROGRAMS } from '@/lib/programs';

export async function POST(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  try {
    const ids = async (docId: string): Promise<Set<string>> => {
      const snap = await db.collection('config').doc(docId).get();
      return new Set(((snap.data()?.ids as string[]) ?? []));
    };
    const [deleted, purged, hidden, existingSnap] = await Promise.all([
      ids('deletedMocks'), ids('purgedMocks'), ids('hiddenMocks'),
      db.collection('programs').get(),
    ]);
    const existing = new Set(existingSnap.docs.map((d) => d.id));

    const toImport = MOCK_PROGRAMS.filter(
      (p) => !existing.has(p.id) && !deleted.has(p.id) && !purged.has(p.id) && !hidden.has(p.id),
    );

    // Batched: a program document carries its whole schedule, so this is a
    // handful of large writes rather than many small ones.
    let written = 0;
    for (let i = 0; i < toImport.length; i += 20) {
      const batch = db.batch();
      for (const p of toImport.slice(i, i + 20)) {
        batch.set(db.collection('programs').doc(p.id), {
          ...p,
          // Imported programs keep whatever visibility the seed implied: they
          // were on screen a moment ago and must not silently disappear.
          isPublic: true,
          importedFromBuiltin: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        written++;
      }
      await batch.commit();
    }

    // The switch. From here the bundled copies are ignored everywhere, so the
    // admin list is the whole truth about which programs exist.
    await db.collection('system').doc('config').set({ builtinsImported: true }, { merge: true });

    console.warn(`[admin/import-builtins] ${check.uid} imported ${written} built-in program(s); builtins are now database-managed`);

    return NextResponse.json({
      ok: true,
      imported: written,
      alreadyInDatabase: MOCK_PROGRAMS.filter((p) => existing.has(p.id)).length,
      skippedDeleted: MOCK_PROGRAMS.filter((p) => deleted.has(p.id) || purged.has(p.id) || hidden.has(p.id)).length,
    });
  } catch (err) {
    console.error('[admin/import-builtins] Failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 500 });
  }
}
