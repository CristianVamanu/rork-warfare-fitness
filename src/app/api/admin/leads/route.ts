export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every collected email, paged or as a CSV.
 *
 * Three forms feed `landingLeads`: the exit-intent box on the landing page
 * (email only, no source), the standards test result, and the free-plan
 * signup. The admin panel used to read the newest 300 straight from the
 * browser; a list for marketing needs all of them and needs to say, per
 * address, whether that person agreed to marketing — sending a campaign to
 * the ones who did not is the thing the unsubscribe work exists to prevent.
 *
 * GET ?limit=&after=&source=&consent=       one page, newest first
 * GET ?format=csv&source=&consent=          everything matching, as a file
 *
 * consent=opted-in is the default for the CSV: the file an admin drops into
 * a mailing tool should not contain anyone who did not tick the box. The
 * full list is still available (consent=all) for record-keeping.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Query, DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { LeadRow, LeadSource } from '@/lib/leads';
import { verifyAdmin } from '@/lib/verifyAdmin';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { toCsv } from '@/lib/csv';

const SOURCES: readonly LeadSource[] = ['landing', 'standards', 'free-plan'];
type Source = LeadSource;
const CONSENTS = ['opted-in', 'all', 'opted-out'] as const;
type Consent = typeof CONSENTS[number];

function toRow(id: string, d: DocumentData): LeadRow {
  const src = d.source === 'standards' || d.source === 'free-plan' ? d.source : 'landing';
  const created = (d.createdAt as { toDate?: () => Date } | undefined)?.toDate?.();
  return {
    id,
    email: typeof d.email === 'string' ? d.email : '',
    source: src,
    marketingOptIn: d.marketingOptIn === true,
    programName: typeof d.programName === 'string' ? d.programName : '',
    dripActive: d.dripActive === true,
    createdAt: created ? created.toISOString() : '',
  };
}

function matches(row: LeadRow, source: Source | 'all', consent: Consent): boolean {
  if (source !== 'all' && row.source !== source) return false;
  if (consent === 'opted-in' && !row.marketingOptIn) return false;
  if (consent === 'opted-out' && row.marketingOptIn) return false;
  return true;
}

export async function GET(req: NextRequest) {
  const check = await verifyAdmin(req);
  if ('error' in check) return NextResponse.json({ error: check.error }, { status: check.status });
  const app = getAdminApp();
  if (!app) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
  const db = getAdminDb(app);

  const q = req.nextUrl.searchParams;
  const sourceParam = q.get('source') ?? 'all';
  const source: Source | 'all' = (SOURCES as readonly string[]).includes(sourceParam) ? (sourceParam as Source) : 'all';
  const format = q.get('format');

  // Filtering happens in memory, on the page being read. `source` is absent
  // on exit-intent leads and `marketingOptIn` is absent on most of them, so
  // a Firestore where() on either would silently drop those documents;
  // reading in createdAt order and filtering here keeps the count honest.
  // The collection is bounded by human signups, so paging through it in
  // 500s is cheap.
  const base: Query = db.collection('landingLeads').orderBy('createdAt', 'desc');

  if (format === 'csv') {
    const consentParam = q.get('consent') ?? 'opted-in';
    const consent: Consent = (CONSENTS as readonly string[]).includes(consentParam) ? (consentParam as Consent) : 'opted-in';
    const rows: (string | number)[][] = [];
    const seen = new Set<string>();
    let cursor: QueryDocumentSnapshot | null = null;
    for (let guard = 0; guard < 200; guard++) {
      let page = base.limit(500);
      if (cursor) page = page.startAfter(cursor);
      const snap = await page.get();
      for (const d of snap.docs) {
        const row = toRow(d.id, d.data());
        if (!row.email || !matches(row, source, consent)) continue;
        // One line per address: someone who did the standards test and then
        // the free plan is one subscriber, not two.
        const key = row.email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push([row.email, row.source, row.marketingOptIn ? 'yes' : 'no', row.programName, row.createdAt.slice(0, 10)]);
      }
      if (snap.size < 500) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    const csv = toCsv(['Email', 'Source', 'Marketing opt-in', 'Program', 'Date'], rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="emails-${consent}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const consentParam = q.get('consent') ?? 'all';
  const consent: Consent = (CONSENTS as readonly string[]).includes(consentParam) ? (consentParam as Consent) : 'all';
  const limit = Math.min(100, Math.max(1, Number(q.get('limit')) || 20));
  const after = q.get('after');

  let cursor: DocumentSnapshot | null = null;
  if (after) {
    const snap = await db.collection('landingLeads').doc(after).get();
    if (snap.exists) cursor = snap;
  }

  // Read forward until a page's worth matches the filter, then one more
  // match: the extra is what says a Next page exists. Without it the last
  // page, when it fills exactly, offered a Next that fetched nothing.
  const items: LeadRow[] = [];
  let last: QueryDocumentSnapshot | null = null;
  let pageEndId: string | null = null;
  let hasMore = false;
  let done = false;
  for (let guard = 0; guard < 40 && !hasMore && !done; guard++) {
    let page = base.limit(200);
    const start = last ?? cursor;
    if (start) page = page.startAfter(start);
    const snap = await page.get();
    for (const d of snap.docs) {
      last = d;
      const row = toRow(d.id, d.data());
      if (!row.email || !matches(row, source, consent)) continue;
      if (items.length < limit) {
        items.push(row);
        if (items.length === limit) pageEndId = d.id;
      } else {
        hasMore = true;
        break;
      }
    }
    if (snap.size < 200) done = true;
  }
  // hasMore is the normal signal. If the read guard ran out before the end
  // of the collection was seen, hand back a cursor anyway so a very large
  // filtered list keeps paging instead of quietly ending here.
  const nextAfter = hasMore ? pageEndId : (done ? null : (pageEndId ?? last?.id ?? null));
  return NextResponse.json({ items, nextAfter });
}
