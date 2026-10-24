/**
 * Partner (affiliate) program — the pure parts.
 *
 * No Firestore, no Stripe, no clock reads: everything here takes its inputs
 * as arguments so it can be asserted in partners.test.ts. The server side
 * (lib/partnersServer.ts, the Stripe webhook, the /api/partner and
 * /api/admin/partners routes) composes these.
 *
 * Money is integer cents throughout. Percentages are whole numbers (30 = 30%).
 */

// ── Codes ─────────────────────────────────────────────────────────────────

/** Partner codes use their own alphabet and length so they can never collide
 *  with, or be mistaken for, a member referral code (lib/referral.ts). They
 *  are read out loud in videos, so no 0/O or 1/I/L. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const PARTNER_COOKIE = 'wf_ref';
/** The query parameter that attributes a visit on any page: `/?pref=CODE`. */
export const PARTNER_QUERY_PARAM = 'pref';

export function generatePartnerCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

/** A code a partner picked themselves (their handle), or a generated one.
 *  Upper-cased before the check so `/p/coachmike` works. */
export function normalizePartnerCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toUpperCase();
  return /^[A-Z0-9]{3,20}$/.test(v) ? v : null;
}

// ── Program settings ───────────────────────────────────────────────────────

export interface PartnerProgramConfig {
  enabled: boolean;
  /** Revenue share for partners without an override, whole percent. */
  defaultPercent: number;
  /** Commission is "pending" for this many days after the invoice, then payable. */
  holdDays: number;
  /** How long a click keeps attributing a signup. */
  cookieDays: number;
  minPayoutCents: number;
  /** 0 = lifetime of the subscription. Otherwise commission stops N months after attribution. */
  capMonths: number;
  /** 'connect' pays through Stripe Connect transfers; 'manual' only records what is owed. */
  payoutMode: 'connect' | 'manual';
  /** Approved partners get membership access without paying. */
  freeMembership: boolean;
  /** Current agreement version. Partners must re-accept when it changes. */
  agreementVersion: number;
  agreementText: string;
}

export const DEFAULT_PARTNER_CONFIG: PartnerProgramConfig = {
  enabled: true,
  defaultPercent: 30,
  holdDays: 30,
  cookieDays: 60,
  minPayoutCents: 5000,
  capMonths: 0,
  payoutMode: 'connect',
  freeMembership: true,
  agreementVersion: 1,
  agreementText: `PARTNER AGREEMENT

1. You earn a share of the net revenue from members who join through your link or code, on every paid invoice, for as long as the member stays and the program runs.
2. Commission is held for the hold period shown on your dashboard and is reversed if the payment is refunded or disputed.
3. No self-referral. Do not buy memberships through your own link, for yourself or for accounts you control. Flagged commissions are reviewed and may be rejected.
4. No spam, no misleading claims about results, no bidding on the brand name in paid ads, no coupon-site listings.
5. Payouts go to the Stripe account you connect, monthly, once your balance clears the minimum.
6. Either side can end this at any time. Earned, approved commissions are still paid out; pending commissions on a suspended account are reviewed first.
7. You are responsible for your own taxes on what you earn.`,
};

/** Clamp whatever is stored (or submitted by the admin form) to a sane config. */
export function normalizePartnerConfig(raw: Partial<PartnerProgramConfig> | null | undefined): PartnerProgramConfig {
  const r = raw ?? {};
  const num = (v: unknown, d: number, lo: number, hi: number) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
  };
  return {
    enabled: r.enabled !== false,
    defaultPercent: num(r.defaultPercent, DEFAULT_PARTNER_CONFIG.defaultPercent, 0, 90),
    holdDays: num(r.holdDays, DEFAULT_PARTNER_CONFIG.holdDays, 0, 180),
    cookieDays: num(r.cookieDays, DEFAULT_PARTNER_CONFIG.cookieDays, 1, 365),
    minPayoutCents: num(r.minPayoutCents, DEFAULT_PARTNER_CONFIG.minPayoutCents, 0, 10_000_000),
    capMonths: num(r.capMonths, DEFAULT_PARTNER_CONFIG.capMonths, 0, 120),
    payoutMode: r.payoutMode === 'manual' ? 'manual' : 'connect',
    freeMembership: r.freeMembership !== false,
    agreementVersion: num(r.agreementVersion, DEFAULT_PARTNER_CONFIG.agreementVersion, 1, 1_000_000),
    agreementText: typeof r.agreementText === 'string' && r.agreementText.trim() ? r.agreementText : DEFAULT_PARTNER_CONFIG.agreementText,
  };
}

// ── Partners ───────────────────────────────────────────────────────────────

export type PartnerStatus = 'applied' | 'active' | 'suspended' | 'rejected';

export interface PartnerProfile {
  name: string;
  email: string;
  /** Where they will promote: Instagram, YouTube, a gym, a newsletter… */
  channels: string;
  /** Rough audience size, in their own words. */
  audience: string;
  about: string;
  website?: string;
}

export interface PartnerDoc {
  uid: string;
  code: string;
  status: PartnerStatus;
  profile: PartnerProfile;
  /** Whole percent; null/undefined = program default. */
  percentOverride?: number | null;
  /** 0/undefined = program default. */
  capMonthsOverride?: number | null;
  connectAccountId?: string | null;
  connectReady?: boolean;
  agreementVersion?: number;
  agreementAcceptedAt?: unknown;
  notes?: string;
  createdAt?: unknown;
  reviewedAt?: unknown;
  reviewedBy?: string;
  /** Set when the program's free membership was granted, so it can be cleanly taken back. */
  membershipGranted?: boolean;
}

export function effectivePercent(partner: Pick<PartnerDoc, 'percentOverride'>, cfg: PartnerProgramConfig): number {
  const o = partner.percentOverride;
  if (typeof o === 'number' && Number.isFinite(o) && o >= 0 && o <= 90) return Math.round(o);
  return cfg.defaultPercent;
}

export function effectiveCapMonths(partner: Pick<PartnerDoc, 'capMonthsOverride'>, cfg: PartnerProgramConfig): number {
  const o = partner.capMonthsOverride;
  if (typeof o === 'number' && Number.isFinite(o) && o > 0) return Math.round(o);
  return cfg.capMonths;
}

/** A partner can only attribute while active. Applied / suspended / rejected
 *  codes are recognised (so a link still lands on the site) but earn nothing. */
export function partnerCanEarn(partner: Pick<PartnerDoc, 'status'> | null | undefined): boolean {
  return partner?.status === 'active';
}

// ── Attribution ────────────────────────────────────────────────────────────

export interface Attribution {
  /** Code captured from a link, cookie or typed at checkout. */
  pendingCode?: string | null;
  /** 'link' | 'cookie' | 'typed' */
  source?: string;
  capturedAt?: unknown;
  /** Set once at first payment, never changed. */
  partnerId?: string | null;
  partnerCode?: string | null;
  lockedAt?: unknown;
}

/** Whether a newly presented code may replace what the member already has.
 *  Locked attribution is final. A member who already paid once (membership
 *  ever active) cannot be attributed after the fact either. */
export function canAttachCode(current: Attribution | null | undefined, hasEverPaid: boolean): boolean {
  if (current?.partnerId || current?.lockedAt) return false;
  if (hasEverPaid) return false;
  return true;
}

/** Months elapsed between attribution and an invoice, for the cap. */
export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return to.getDate() < from.getDate() ? Math.max(0, months - 1) : Math.max(0, months);
}

// ── Ledger ─────────────────────────────────────────────────────────────────

export type LedgerStatus =
  | 'pending'   // inside the hold window
  | 'review'    // a fraud flag is set; waits for the admin
  | 'approved'  // explicitly approved by the admin, or hold passed and clean
  | 'rejected'  // admin rejected (fraud, self-referral)
  | 'paid'      // included in a payout
  | 'clawback'; // a negative row from a refund/dispute

export interface LedgerRow {
  id: string;
  partnerId: string;
  partnerCode: string;
  memberUid: string;
  invoiceId: string;
  chargeId?: string | null;
  subscriptionId?: string | null;
  /** Negative for clawbacks. */
  grossCents: number;
  feeCents: number;
  netCents: number;
  percent: number;
  commissionCents: number;
  currency: string;
  status: LedgerStatus;
  flags: string[];
  holdUntil?: unknown;
  payoutId?: string | null;
  createdAt?: unknown;
  /** For clawbacks: the row this reverses. */
  reverses?: string | null;
  planName?: string | null;
  note?: string | null;
}

export interface CommissionInput {
  /** What the member paid on this invoice, cents. */
  amountPaidCents: number;
  /** Stripe's processing fee for the charge, cents (0 if unknown). */
  feeCents: number;
  percent: number;
}

/** Commission on an invoice. Net = paid minus the processing fee; never below
 *  zero; rounded half-up to the cent. A $0 invoice (free trial) earns nothing. */
export function computeCommission(i: CommissionInput): { netCents: number; commissionCents: number } {
  const paid = Math.max(0, Math.round(i.amountPaidCents));
  const fee = Math.min(paid, Math.max(0, Math.round(i.feeCents)));
  const netCents = paid - fee;
  const pct = Math.min(100, Math.max(0, i.percent));
  const commissionCents = Math.round((netCents * pct) / 100);
  return { netCents, commissionCents };
}

/** Clawback for a refund. `refundedCents` is what went back to the member;
 *  the commission reversed is the same share of it the partner earned. */
export function computeClawback(original: Pick<LedgerRow, 'grossCents' | 'commissionCents'>, refundedCents: number): number {
  if (original.grossCents <= 0 || original.commissionCents <= 0) return 0;
  const share = Math.min(1, Math.max(0, refundedCents / original.grossCents));
  return -Math.round(original.commissionCents * share);
}

/** The status a row reads as right now. Stored 'pending' becomes 'approved'
 *  on its own once the hold passes, without a cron: anything that pays or
 *  totals rows calls this first. */
export function derivedStatus(row: Pick<LedgerRow, 'status' | 'holdUntil' | 'flags'>, now: Date): LedgerStatus {
  if (row.status !== 'pending') return row.status;
  if (row.flags && row.flags.length > 0) return 'review';
  const hold = toDate(row.holdUntil);
  if (hold && hold.getTime() > now.getTime()) return 'pending';
  return 'approved';
}

export interface Balance {
  pendingCents: number;
  reviewCents: number;
  approvedCents: number;
  paidCents: number;
  clawbackCents: number;
  rejectedCents: number;
  /** What a payout right now would move: approved minus unpaid clawbacks. */
  payableCents: number;
  lifetimeCents: number;
}

export function summarizeLedger(rows: LedgerRow[], now: Date): Balance {
  const b: Balance = { pendingCents: 0, reviewCents: 0, approvedCents: 0, paidCents: 0, clawbackCents: 0, rejectedCents: 0, payableCents: 0, lifetimeCents: 0 };
  let unpaidClawback = 0;
  for (const r of rows) {
    const s = derivedStatus(r, now);
    const c = r.commissionCents;
    if (s === 'pending') b.pendingCents += c;
    else if (s === 'review') b.reviewCents += c;
    else if (s === 'approved') b.approvedCents += c;
    else if (s === 'paid') b.paidCents += c;
    else if (s === 'rejected') b.rejectedCents += c;
    else if (s === 'clawback') { b.clawbackCents += c; if (!r.payoutId) unpaidClawback += c; }
  }
  b.payableCents = b.approvedCents + unpaidClawback; // clawbacks are negative
  b.lifetimeCents = b.approvedCents + b.paidCents + b.pendingCents + b.reviewCents + b.clawbackCents;
  return b;
}

// ── Fraud flags ────────────────────────────────────────────────────────────

export interface FraudContext {
  partnerEmail?: string | null;
  partnerName?: string | null;
  memberEmail?: string | null;
  memberName?: string | null;
  /** Card fingerprint of this invoice's charge. */
  cardFingerprint?: string | null;
  /** Fingerprints already seen on OTHER members attributed to this partner. */
  partnerMemberFingerprints?: Record<string, string>; // fingerprint -> memberUid
  /** The partner's own card fingerprint(s), if they ever paid for anything. */
  partnerOwnFingerprints?: string[];
  /** Attributions locked for this partner in the last 24h, before this one. */
  locksLast24h?: number;
  /** The member's uid and the partner's uid. */
  memberUid: string;
  partnerUid: string;
}

const emailLocal = (e: string) => e.toLowerCase().split('@')[0].replace(/\./g, '').replace(/\+.*$/, '');
const emailDomain = (e: string) => e.toLowerCase().split('@')[1] ?? '';

/** Every reason this commission should wait for a human. Empty = clean. */
export function fraudFlags(c: FraudContext): string[] {
  const flags: string[] = [];
  if (c.memberUid === c.partnerUid) flags.push('self_referral');
  if (c.memberEmail && c.partnerEmail) {
    const m = c.memberEmail.toLowerCase(), p = c.partnerEmail.toLowerCase();
    if (m === p) flags.push('same_email');
    else if (emailLocal(m) === emailLocal(p) && emailDomain(m) === emailDomain(p)) flags.push('email_alias');
  }
  if (c.memberName && c.partnerName) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    if (norm(c.memberName).length >= 5 && norm(c.memberName) === norm(c.partnerName)) flags.push('same_name');
  }
  if (c.cardFingerprint) {
    if (c.partnerOwnFingerprints?.includes(c.cardFingerprint)) flags.push('partner_card');
    const other = c.partnerMemberFingerprints?.[c.cardFingerprint];
    if (other && other !== c.memberUid) flags.push('shared_card');
  }
  if ((c.locksLast24h ?? 0) >= 5) flags.push('velocity');
  return flags;
}

export const FLAG_LABELS: Record<string, string> = {
  self_referral: 'Member is the partner',
  same_email: 'Member email equals the partner email',
  email_alias: 'Member email is an alias of the partner email',
  same_name: 'Member name equals the partner name',
  partner_card: 'Paid with the partner\'s own card',
  shared_card: 'Card already used by another member of this partner',
  velocity: '5+ attributed sign-ups in 24 hours',
};

// ── Misc ───────────────────────────────────────────────────────────────────

export function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  const o = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof o.toDate === 'function') return o.toDate();
  const s = o.seconds ?? o._seconds;
  if (typeof s === 'number') return new Date(s * 1000);
  return null;
}

export function formatCents(cents: number, currency = 'USD'): string {
  const v = cents / 100;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v); }
  catch { return `$${v.toFixed(2)}`; }
}

/** A stable, non-reversible visitor id for click de-duplication: no raw IP
 *  or user agent is stored. */
export function visitorHashInput(ip: string | null, ua: string | null, day: string): string {
  return `${ip ?? ''}|${(ua ?? '').slice(0, 120)}|${day}`;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** The partner's shareable links. */
export function partnerLinks(appUrl: string, code: string): { link: string; short: string } {
  const base = appUrl.replace(/\/$/, '');
  return { link: `${base}/p/${code}`, short: `${base.replace(/^https?:\/\//, '')}/p/${code}` };
}
