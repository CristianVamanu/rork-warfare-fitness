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
 * skipped. A page where every send fails is retried on the next run,
 * because that is what a provider outage looks like; after three runs
 * with no success on the same page the page is skipped and counted as
 * failed, because that is what two hundred dead addresses look like, and
 * the people after them must still get the email.
 *
 * One runner per broadcast at a time: a claim is written on the document
 * before sending, so the cron and an admin's Send now cannot page over
 * the same cursor together and double-send.
 */
const STUCK_PAGE_LIMIT = 3;

export type BroadcastRunResult = {
  log: string[];
  sent: number;
  finished: boolean;
  /** Set only with onlyId, when nothing ran and the caller should say why. */
  reason?: 'not-found' | 'already-done' | 'busy';
};

export async function runBroadcasts(opts: {
  db: Firestore;
  brand: EmailBrand;
  appUrl: string;
  unsubSecret: string;
  budgetMs: number;
  /** Restrict to one broadcast (the admin's Send now). */
  onlyId?: string;
}): Promise<BroadcastRunResult> {
  const { db, brand, appUrl, unsubSecret, budgetMs, onlyId } = opts;
  const started = Date.now();
  const PAGE = 200;
  const log: string[] = [];
  let sentTotal = 0;
  let allFinished = true;

  let queued: FirebaseFirestore.DocumentSnapshot[];
  if (onlyId) {
    const d = await db.collection('broadcasts').doc(onlyId).get();
    if (!d.exists) return { log, sent: 0, finished: false, reason: 'not-found' };
    if (!['queued', 'sending'].includes(d.data()?.status)) return { log, sent: 0, finished: true, reason: 'already-done' };
    queued = [d];
  } else {
    queued = (await db.collection('broadcasts').where('status', 'in', ['queued', 'sending']).limit(3).get()).docs;
  }

  for (const bdoc of queued) {
    // Claim it. Whoever holds runningUntil in the future is sending; anyone
    // else leaves it alone. The claim expires on its own, so a crashed run
    // cannot wedge a broadcast.
    const claimUntil = Date.now() + budgetMs + 30_000;
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(bdoc.ref);
      const until = fresh.data()?.runningUntil as number | undefined;
      if (typeof until === 'number' && until > Date.now()) return false;
      tx.update(bdoc.ref, { runningUntil: claimUntil });
      return true;
    });
    if (!claimed) {
      if (onlyId) return { log, sent: 0, finished: false, reason: 'busy' };
      allFinished = false;
      continue;
    }

    const b = bdoc.data() as {
      audience: BroadcastAudience; subject: string; body: string; ctaLabel: string; ctaPath: string;
      cursor?: string | null; status?: string; stuckCursor?: string | null; stuckAttempts?: number;
    };
    if (b.status === 'queued') await bdoc.ref.update({ status: 'sending', startedAt: FieldValue.serverTimestamp() });
    const paragraphs = b.body.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
    let cursor: string | null = b.cursor ?? null;
    let finished = false;
    try {
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
      let failedHere = 0;
      if (unique.length > 0 && sentHere === 0) {
        const attempts = (b.stuckCursor === (cursor ?? '') ? (b.stuckAttempts ?? 0) : 0) + 1;
        if (attempts < STUCK_PAGE_LIMIT) {
          console.error(`[broadcast] ${bdoc.id}: 0 of ${unique.length} sent on this page (attempt ${attempts}), will retry next run`);
          await bdoc.ref.update({ lastError: 'provider returned no successes', lastErrorAt: FieldValue.serverTimestamp(), stuckCursor: cursor ?? '', stuckAttempts: attempts });
          allFinished = false;
          break;
        }
        // Three runs, no success: these addresses are the problem, not the
        // provider. Count them failed and move on so the rest get sent.
        console.error(`[broadcast] ${bdoc.id}: skipping a page of ${unique.length} after ${attempts} failed attempts`);
        failedHere = unique.length;
      }
      b.stuckCursor = null; b.stuckAttempts = 0;
      cursor = page.empty ? cursor : page.docs[page.docs.length - 1].id;
      finished = page.size < PAGE;
      sentTotal += sentHere;
      await bdoc.ref.update({
        cursor, sentCount: FieldValue.increment(sentHere), skippedCount: FieldValue.increment(page.size - unique.length),
        failedCount: FieldValue.increment(failedHere), stuckCursor: null, stuckAttempts: 0,
        ...(finished ? { status: 'done', finishedAt: FieldValue.serverTimestamp() } : {}),
      });
      if (sentHere) log.push(`broadcast:${bdoc.id}:+${sentHere}`);
    }
    } finally {
      await bdoc.ref.update({ runningUntil: null }).catch(() => {});
    }
    if (!finished) allFinished = false;
  }
  return { log, sent: sentTotal, finished: allFinished };
}
