import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { sendEmail, marketingEmailHtml, type EmailBrand } from '@/lib/email';
import { unsubscribeUrl } from '@/lib/emailUnsubscribe';
import { userInAudience, type BroadcastAudience } from '@/lib/broadcast';
import { mapWithConcurrency } from '@/lib/concurrency';

/**
 * Sends queued broadcasts, a page at a time, until the time budget runs out.
 *
 * Two callers: the hourly cron with a long budget, and the admin's "Send
 * now" with a short one that fits inside a browser request. Both use the
 * same cursor on the broadcast document, so whichever runs next continues
 * from where the last one stopped; nobody is emailed twice and nobody is
 * skipped. A page where every send fails is not advanced past: the
 * provider was down, and the next run retries that page.
 */
export async function runBroadcasts(opts: {
  db: Firestore;
  brand: EmailBrand;
  appUrl: string;
  unsubSecret: string;
  budgetMs: number;
  /** Restrict to one broadcast (the admin's Send now). */
  onlyId?: string;
}): Promise<{ log: string[]; sent: number; finished: boolean }> {
  const { db, brand, appUrl, unsubSecret, budgetMs, onlyId } = opts;
  const started = Date.now();
  const PAGE = 200;
  const log: string[] = [];
  let sentTotal = 0;
  let allFinished = true;

  const queued = onlyId
    ? await db.collection('broadcasts').doc(onlyId).get().then((d) => (d.exists && ['queued', 'sending'].includes(d.data()?.status) ? [d] : []))
    : (await db.collection('broadcasts').where('status', 'in', ['queued', 'sending']).limit(3).get()).docs;

  for (const bdoc of queued) {
    const b = bdoc.data() as { audience: BroadcastAudience; subject: string; body: string; ctaLabel: string; ctaPath: string; cursor?: string | null; status?: string };
    if (b.status === 'queued') await bdoc.ref.update({ status: 'sending', startedAt: FieldValue.serverTimestamp() });
    const paragraphs = b.body.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
    let cursor: string | null = b.cursor ?? null;
    let finished = false;
    while (!finished && Date.now() - started < budgetMs) {
      const col = b.audience === 'leads' ? 'landingLeads' : 'users';
      let q = db.collection(col).orderBy('__name__').limit(PAGE);
      if (cursor) q = q.startAfter(cursor);
      const page = await q.get();
      const targets: { to: string; scope: 'user' | 'lead' }[] = [];
      for (const doc of page.docs) {
        const data = doc.data();
        if (b.audience === 'leads') {
          if (data.marketingOptIn === true && typeof data.email === 'string') targets.push({ to: data.email, scope: 'lead' });
        } else if (userInAudience(data as Parameters<typeof userInAudience>[0], b.audience)) {
          targets.push({ to: data.email as string, scope: 'user' });
        }
      }
      // The same lead can hold several rows (test + free plan); one email.
      const seen = new Set<string>();
      const unique = targets.filter((t) => (seen.has(t.to) ? false : (seen.add(t.to), true)));
      let sentHere = 0;
      await mapWithConcurrency(unique, 5, async (t) => {
        const unsub = unsubscribeUrl(appUrl, unsubSecret, t.to, t.scope);
        const ok = await sendEmail({
          to: t.to, subject: b.subject, unsubscribeUrl: unsub,
          html: marketingEmailHtml({ brand, appUrl, heading: b.subject, paragraphs, cta: { label: b.ctaLabel, path: b.ctaPath }, unsubscribeUrl: unsub }),
        });
        if (ok) sentHere++;
      });
      // A page with recipients and zero successes is the provider being
      // down, not a page delivered. Leave the cursor and stop; the next run
      // retries the same page. Advancing would mark those people sent.
      if (unique.length > 0 && sentHere === 0) {
        console.error(`[broadcast] ${bdoc.id}: 0 of ${unique.length} sent on this page, will retry next run`);
        await bdoc.ref.update({ lastError: 'provider returned no successes', lastErrorAt: FieldValue.serverTimestamp() });
        allFinished = false;
        break;
      }
      cursor = page.empty ? cursor : page.docs[page.docs.length - 1].id;
      finished = page.size < PAGE;
      sentTotal += sentHere;
      await bdoc.ref.update({
        cursor, sentCount: FieldValue.increment(sentHere), skippedCount: FieldValue.increment(page.size - unique.length),
        ...(finished ? { status: 'done', finishedAt: FieldValue.serverTimestamp() } : {}),
      });
      if (sentHere) log.push(`broadcast:${bdoc.id}:+${sentHere}`);
    }
    if (!finished) allFinished = false;
  }
  return { log, sent: sentTotal, finished: allFinished };
}
