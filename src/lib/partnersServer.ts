/**
 * Partner program — server side. Admin SDK only; import from API routes and
 * the Stripe webhook, never from a client component.
 *
 * Collections (all default-deny to clients; every read and write goes
 * through a route here):
 *   partners/{uid}                one partner per account
 *   partnerCodes/{CODE}           reverse index → { partnerId }
 *   partnerClicks/{code_day_hash} one row per visitor per day (no raw IP/UA)
 *   partnerStats/{partnerId_YYYY-MM}  { clicks, signups, members }
 *   partnerLedger/{invoiceId}     one row per paid invoice, `{invoiceId}_rf_{n}` per refund
 *   partnerPayouts/{id}
 *   config/partnerProgram         settings (admin-writable, publicly readable)
 *   config/partnerResources       { items: [...], tips: [...] }
 * and on the member: users/{uid}.attribution
 */

import { createHash } from 'crypto';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import {
  normalizePartnerConfig, normalizePartnerCode, partnerCanEarn, canAttachCode, effectivePercent, effectiveCapMonths,
  computeCommission, computeClawback, fraudFlags, monthsBetween, dayKey, monthKey, visitorHashInput, toDate,
  type PartnerProgramConfig, type PartnerDoc, type Attribution, type LedgerRow,
} from './partners';

export async function getPartnerConfig(db: Firestore): Promise<PartnerProgramConfig> {
  const snap = await db.collection('config').doc('partnerProgram').get();
  return normalizePartnerConfig(snap.data() as Partial<PartnerProgramConfig> | undefined);
}

export async function getPartnerByCode(db: Firestore, rawCode: unknown): Promise<PartnerDoc | null> {
  const code = normalizePartnerCode(rawCode);
  if (!code) return null;
  const idx = await db.collection('partnerCodes').doc(code).get();
  const partnerId = idx.data()?.partnerId as string | undefined;
  if (!partnerId) return null;
  const snap = await db.collection('partners').doc(partnerId).get();
  return snap.exists ? (snap.data() as PartnerDoc) : null;
}

export async function getPartner(db: Firestore, uid: string): Promise<PartnerDoc | null> {
  const snap = await db.collection('partners').doc(uid).get();
  return snap.exists ? (snap.data() as PartnerDoc) : null;
}

// ── Clicks ─────────────────────────────────────────────────────────────────

/**
 * Records a click once per visitor per day. The document id IS the
 * de-duplication: `${code}_${day}_${hash}` — a reload, a second tap or a
 * bot hammering the link counts once. Nothing identifying is stored; the
 * hash is salted with the day so it cannot be joined across days either.
 *
 * Returns true when a new click was counted.
 */
export async function recordPartnerClick(db: Firestore, opts: {
  code: string; ip: string | null; ua: string | null; landing: string; now?: Date;
}): Promise<boolean> {
  const partner = await getPartnerByCode(db, opts.code);
  // Unknown or inactive codes still land on the site, but are not counted.
  if (!partner || !partnerCanEarn(partner)) return false;
  const now = opts.now ?? new Date();
  const day = dayKey(now);
  const hash = createHash('sha256').update(visitorHashInput(opts.ip, opts.ua, day)).digest('hex').slice(0, 24);
  const id = `${partner.code}_${day}_${hash}`;
  try {
    await db.collection('partnerClicks').doc(id).create({
      partnerId: partner.uid, code: partner.code, day, landing: opts.landing.slice(0, 200), createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    return false; // already counted today
  }
  await bumpStat(db, partner.uid, now, 'clicks');
  return true;
}

async function bumpStat(db: Firestore, partnerId: string, when: Date, field: 'clicks' | 'signups' | 'members') {
  await db.collection('partnerStats').doc(`${partnerId}_${monthKey(when)}`).set({
    partnerId, month: monthKey(when), [field]: FieldValue.increment(1),
  }, { merge: true });
  await db.collection('partners').doc(partnerId).set({ totals: { [field]: FieldValue.increment(1) } }, { merge: true });
}

// ── Attribution on the member ──────────────────────────────────────────────

/**
 * Attaches a partner code to a member as PENDING attribution. Source is where
 * the code came from (the /p link cookie or a code typed at checkout).
 * Refused, silently, when the member is already locked to a partner, already
 * paid before, or is the partner themselves. Returns what happened so the
 * caller's UI can say "applied" or stay quiet.
 */
export async function attachPendingCode(db: Firestore, opts: {
  uid: string; code: unknown; source: 'link' | 'typed'; now?: Date;
}): Promise<{ attached: boolean; reason?: string; partnerCode?: string }> {
  const partner = await getPartnerByCode(db, opts.code);
  if (!partner) return { attached: false, reason: 'unknown_code' };
  if (!partnerCanEarn(partner)) return { attached: false, reason: 'partner_inactive' };
  if (partner.uid === opts.uid) return { attached: false, reason: 'self' };
  const userRef = db.collection('users').doc(opts.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return { attached: false, reason: 'no_user' };
  const u = userSnap.data() ?? {};
  const current = (u.attribution ?? null) as Attribution | null;
  const everPaid = !!u.trialUsedAt || u.membership?.status === 'active' || !!u.membership?.stripeSubscriptionId || !!u.membership?.grantedAt;
  if (!canAttachCode(current, everPaid)) return { attached: false, reason: 'locked' };
  // A typed code at checkout beats a cookie: the member is telling us whose
  // code it is. A cookie never overwrites a typed one.
  if (current?.pendingCode && current.source === 'typed' && opts.source === 'link') {
    return { attached: false, reason: 'typed_wins', partnerCode: current.pendingCode };
  }
  const isNewPartner = current?.pendingCode !== partner.code;
  await userRef.set({
    attribution: { pendingCode: partner.code, pendingPartnerId: partner.uid, source: opts.source, capturedAt: opts.now ?? new Date() },
  }, { merge: true });
  if (isNewPartner) await bumpStat(db, partner.uid, opts.now ?? new Date(), 'signups');
  return { attached: true, partnerCode: partner.code };
}

/** The pending partner for a member about to check out, or null. Re-checks
 *  the partner is still active at this moment: a suspended partner's cookie
 *  must not ride into a subscription's metadata. */
export async function pendingPartnerFor(db: Firestore, userData: Record<string, unknown> | undefined): Promise<PartnerDoc | null> {
  const a = (userData?.attribution ?? null) as Attribution | null;
  if (!a || a.partnerId || !a.pendingCode) return null;
  const partner = await getPartnerByCode(db, a.pendingCode);
  return partner && partnerCanEarn(partner) ? partner : null;
}

/**
 * Locks attribution at first payment. Idempotent: a second call for the same
 * member is a no-op. Runs in a transaction so two webhook deliveries cannot
 * both count the member.
 */
export async function lockAttribution(db: Firestore, opts: { uid: string; partnerId: string; partnerCode: string; now?: Date }): Promise<boolean> {
  const userRef = db.collection('users').doc(opts.uid);
  const now = opts.now ?? new Date();
  const locked = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return false;
    const a = (snap.data()?.attribution ?? {}) as Attribution;
    if (a.partnerId) return false;
    tx.set(userRef, { attribution: { ...a, partnerId: opts.partnerId, partnerCode: opts.partnerCode, lockedAt: now } }, { merge: true });
    return true;
  });
  if (locked) await bumpStat(db, opts.partnerId, now, 'members');
  return locked;
}

// ── Ledger ─────────────────────────────────────────────────────────────────

/** Partner id + code off a subscription (or customer) metadata, if any. */
export function partnerFromMetadata(meta: Stripe.Metadata | null | undefined): { partnerId: string; partnerCode: string } | null {
  const id = meta?.partnerId, code = meta?.partnerCode;
  return id && code ? { partnerId: id, partnerCode: code } : null;
}

/**
 * Writes the commission row for a paid invoice. Returns the row, or null when
 * nothing is owed (no partner, $0 invoice, partner inactive, cap reached).
 * The invoice id is the document id, so a replayed event cannot pay twice.
 */
export async function recordInvoiceCommission(db: Firestore, opts: {
  invoiceId: string;
  memberUid: string;
  partnerId: string;
  partnerCode: string;
  amountPaidCents: number;
  currency: string;
  feeCents: number;
  chargeId?: string | null;
  subscriptionId?: string | null;
  cardFingerprint?: string | null;
  planName?: string | null;
  now?: Date;
}): Promise<LedgerRow | null> {
  const now = opts.now ?? new Date();
  const rowRef = db.collection('partnerLedger').doc(opts.invoiceId);
  if ((await rowRef.get()).exists) return null;
  if (opts.amountPaidCents <= 0) return null;

  const [cfg, partnerSnap, memberSnap] = await Promise.all([
    getPartnerConfig(db),
    db.collection('partners').doc(opts.partnerId).get(),
    db.collection('users').doc(opts.memberUid).get(),
  ]);
  const partner = partnerSnap.data() as PartnerDoc | undefined;
  if (!partner || !partnerCanEarn(partner)) return null;
  const member = memberSnap.data() ?? {};

  // Cap: N months after the attribution lock, nothing more is owed.
  const cap = effectiveCapMonths(partner, cfg);
  const lockedAt = toDate((member.attribution as Attribution | undefined)?.lockedAt);
  if (cap > 0 && lockedAt && monthsBetween(lockedAt, now) >= cap) return null;

  const percent = effectivePercent(partner, cfg);
  const { netCents, commissionCents } = computeCommission({ amountPaidCents: opts.amountPaidCents, feeCents: opts.feeCents, percent });

  // Fraud context: this partner's other members' card fingerprints and the
  // partner's own, both read from the ledger itself.
  let partnerMemberFingerprints: Record<string, string> = {};
  let partnerOwnFingerprints: string[] = [];
  let locksLast24h = 0;
  try {
    const prior = await db.collection('partnerLedger').where('partnerId', '==', opts.partnerId).limit(500).get();
    prior.docs.forEach((d) => {
      const r = d.data() as LedgerRow & { cardFingerprint?: string };
      if (r.cardFingerprint && r.memberUid !== opts.memberUid) partnerMemberFingerprints[r.cardFingerprint] = r.memberUid;
    });
    const own = await db.collection('partnerLedger').where('memberUid', '==', opts.partnerId).limit(50).get();
    partnerOwnFingerprints = own.docs.map((d) => (d.data() as { cardFingerprint?: string }).cardFingerprint).filter((x): x is string => !!x);
    const since = new Date(now.getTime() - 24 * 3600 * 1000);
    const recent = await db.collection('users').where('attribution.partnerId', '==', opts.partnerId).where('attribution.lockedAt', '>=', since).limit(20).get();
    locksLast24h = Math.max(0, recent.size - 1);
  } catch (err) {
    console.warn('[partners] fraud context lookup failed (row still written):', err instanceof Error ? err.message : err);
    partnerMemberFingerprints = {};
  }
  const flags = fraudFlags({
    memberUid: opts.memberUid, partnerUid: opts.partnerId,
    memberEmail: member.email as string | undefined, memberName: member.displayName as string | undefined,
    partnerEmail: partner.profile?.email, partnerName: partner.profile?.name,
    cardFingerprint: opts.cardFingerprint ?? null, partnerMemberFingerprints, partnerOwnFingerprints, locksLast24h,
  });

  const holdUntil = new Date(now.getTime() + cfg.holdDays * 24 * 3600 * 1000);
  const row: LedgerRow & { cardFingerprint?: string | null } = {
    id: opts.invoiceId,
    partnerId: opts.partnerId, partnerCode: opts.partnerCode, memberUid: opts.memberUid,
    invoiceId: opts.invoiceId, chargeId: opts.chargeId ?? null, subscriptionId: opts.subscriptionId ?? null,
    grossCents: Math.round(opts.amountPaidCents), feeCents: Math.round(opts.feeCents), netCents, percent, commissionCents,
    currency: (opts.currency || 'usd').toLowerCase(),
    status: 'pending', flags, holdUntil, payoutId: null, createdAt: now, reverses: null,
    planName: opts.planName ?? null, note: null, cardFingerprint: opts.cardFingerprint ?? null,
  };
  try {
    await rowRef.create(row);
  } catch {
    return null; // raced with a duplicate delivery
  }
  await db.collection('partners').doc(opts.partnerId).set({
    totals: { revenueCents: FieldValue.increment(row.grossCents), commissionCents: FieldValue.increment(commissionCents) },
    lastEarnedAt: now,
  }, { merge: true });
  return row;
}

/**
 * Reverses commission after a refund or dispute. Finds the original row by
 * invoice id, falling back to the charge id. One clawback row per refund
 * event (`{invoiceId}_rf_{eventId}`), so retries do not double-reverse.
 */
export async function recordClawback(db: Firestore, opts: {
  invoiceId?: string | null; chargeId?: string | null; refundedCents: number; eventId: string; reason: 'refund' | 'dispute'; now?: Date;
}): Promise<LedgerRow | null> {
  let original: LedgerRow | null = null;
  if (opts.invoiceId) {
    const s = await db.collection('partnerLedger').doc(opts.invoiceId).get();
    if (s.exists) original = s.data() as LedgerRow;
  }
  if (!original && opts.chargeId) {
    const q = await db.collection('partnerLedger').where('chargeId', '==', opts.chargeId).limit(1).get();
    if (!q.empty) original = q.docs[0].data() as LedgerRow;
  }
  if (!original || original.status === 'clawback') return null;
  const amount = computeClawback(original, opts.refundedCents);
  if (amount === 0) return null;
  const now = opts.now ?? new Date();
  const id = `${original.invoiceId}_rf_${opts.eventId}`;
  const row: LedgerRow = {
    ...original,
    id, status: 'clawback', flags: [], holdUntil: null, payoutId: null, createdAt: now,
    grossCents: -Math.round(opts.refundedCents), feeCents: 0, netCents: -Math.round(opts.refundedCents), commissionCents: amount,
    reverses: original.id, note: opts.reason === 'dispute' ? 'Chargeback' : 'Refund',
  };
  try {
    await db.collection('partnerLedger').doc(id).create(row);
  } catch {
    return null;
  }
  // An original still inside its hold is simply rejected rather than paid
  // and then clawed back — same net, less noise on the statement.
  if (original.status === 'pending') {
    await db.collection('partnerLedger').doc(original.id).set({ status: 'rejected', note: `Reversed: ${row.note}` }, { merge: true });
  }
  await db.collection('partners').doc(original.partnerId).set({
    totals: { revenueCents: FieldValue.increment(row.grossCents), commissionCents: FieldValue.increment(amount) },
  }, { merge: true });
  return row;
}

/** Stripe's fee and the card fingerprint for an invoice's charge. Best
 *  effort: an invoice always earns, with or without these. */
export async function chargeDetails(stripe: Stripe, invoice: Stripe.Invoice): Promise<{ feeCents: number; chargeId: string | null; fingerprint: string | null }> {
  const raw = (invoice as { charge?: string | Stripe.Charge | null }).charge;
  const chargeId = typeof raw === 'string' ? raw : raw?.id ?? null;
  if (!chargeId) return { feeCents: 0, chargeId: null, fingerprint: null };
  try {
    const ch = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
    const bt = ch.balance_transaction as Stripe.BalanceTransaction | string | null;
    const feeCents = bt && typeof bt === 'object' ? bt.fee : 0;
    const fingerprint = ch.payment_method_details?.card?.fingerprint ?? null;
    return { feeCents, chargeId, fingerprint };
  } catch (err) {
    console.warn('[partners] charge lookup failed, commission computed on gross:', err instanceof Error ? err.message : err);
    return { feeCents: 0, chargeId, fingerprint: null };
  }
}

// ── Membership perk ────────────────────────────────────────────────────────

/** Grants (or removes) the program's free membership on a partner's account.
 *  Never touches a membership that came from Stripe or from an admin grant. */
export async function setPartnerMembership(db: Firestore, uid: string, grant: boolean): Promise<void> {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const m = (snap.data()?.membership ?? {}) as { status?: string; stripeSubscriptionId?: string; source?: string };
  if (grant) {
    if (m.status === 'active') return; // already a paying member or granted
    await ref.set({ membership: { status: 'active', source: 'partner', grantedAt: FieldValue.serverTimestamp() } }, { merge: true });
    await db.collection('partners').doc(uid).set({ membershipGranted: true }, { merge: true });
  } else {
    if (m.source !== 'partner') return;
    await ref.set({ membership: { status: 'none', source: FieldValue.delete() } }, { merge: true });
    await db.collection('partners').doc(uid).set({ membershipGranted: false }, { merge: true });
  }
}
