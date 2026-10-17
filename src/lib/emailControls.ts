/**
 * Every email the app can send, in one list the admin can switch.
 *
 * Each send names its kind. sendEmail looks the kind up here, against the
 * admin's switches in system/config.emailControls, and refuses to send a
 * kind that is off. `required` kinds (sign-in codes, password resets)
 * cannot be switched off: without them people are locked out.
 *
 * Pure: no clock, no database, safe to import from the admin page.
 */

export type EmailKind =
  | 'auth'
  | 'welcome'
  | 'achievement'
  | 'coachingStatus'
  | 'trialCharge'
  | 'paymentFailed'
  | 'trialEnding'
  | 'checkoutRecovery'
  | 'standardsResult'
  | 'landingLead'
  | 'freePlanDrip'
  | 'sequence'
  | 'broadcast'
  | 'direct'
  | 'adminAlert';

export type EmailGroup = 'account' | 'billing' | 'marketing' | 'admin';

export interface EmailKindDef {
  kind: EmailKind;
  label: string;
  /** When it goes out, in one line. */
  when: string;
  group: EmailGroup;
  /** Cannot be switched off. */
  required?: boolean;
  /** Switching it off has a cost worth a warning. */
  warning?: string;
}

export const EMAIL_KINDS: EmailKindDef[] = [
  { kind: 'auth', label: 'Sign-in, verification and password emails', when: 'Whenever someone signs up, resets a password or uses two-factor', group: 'account', required: true },
  { kind: 'welcome', label: 'Welcome', when: 'Once, right after a new account is created', group: 'account' },
  { kind: 'achievement', label: 'Badge unlocked', when: 'When a member earns an achievement', group: 'account' },
  { kind: 'coachingStatus', label: 'Coaching application decision', when: 'When you approve or decline a 1:1 coaching application', group: 'account' },
  { kind: 'trialCharge', label: 'Upcoming charge reminder', when: 'Three days before the $1 trial rolls into the paid plan', group: 'billing', warning: 'UK and EU rules expect a reminder before an auto-renewal. Keep this on.' },
  { kind: 'paymentFailed', label: 'Payment failed', when: 'When a renewal charge is declined, once per invoice', group: 'billing', warning: 'Without it, members find out by losing access.' },
  { kind: 'trialEnding', label: 'Free trial ending', when: 'Two days before a free (no-card) trial ends', group: 'marketing' },
  { kind: 'checkoutRecovery', label: 'Abandoned checkout', when: 'A few hours after someone starts checkout and leaves', group: 'marketing' },
  { kind: 'standardsResult', label: 'Standards test result', when: 'Right after a visitor finishes the selection test and asks for the result', group: 'marketing' },
  { kind: 'landingLead', label: 'Landing page follow-up', when: 'When a visitor leaves an email on the landing page', group: 'marketing' },
  { kind: 'freePlanDrip', label: 'Free plan sessions', when: 'One session a day to free-plan leads', group: 'marketing' },
  { kind: 'sequence', label: 'Follow-up sequences', when: 'Quiz abandon, no first workout, gone quiet, test follow-up. Each is edited below', group: 'marketing' },
  { kind: 'broadcast', label: 'Broadcasts', when: 'Only when you send one from this page', group: 'marketing' },
  { kind: 'direct', label: 'Direct email to a member', when: 'Only when you email someone from their profile', group: 'admin' },
  { kind: 'adminAlert', label: 'Alerts to you', when: 'Error digest and demo requests, sent to the admin address', group: 'admin' },
];

export const EMAIL_GROUP_LABELS: Record<EmailGroup, string> = {
  account: 'Account',
  billing: 'Billing',
  marketing: 'Marketing',
  admin: 'Admin',
};

export interface EmailControls {
  /** Stops every marketing email at once. Account, billing and admin mail still go. */
  pauseMarketing?: boolean;
  /** Local hour (0-23) the daily sends go out in each member's own timezone. Default 8. */
  sendHour?: number;
  kinds?: Partial<Record<EmailKind, boolean>>;
}

export const DEFAULT_SEND_HOUR = 8;

export function sendHourOf(controls: EmailControls | null | undefined): number {
  const h = controls?.sendHour;
  return Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23 ? (h as number) : DEFAULT_SEND_HOUR;
}

export function emailKindDef(kind: EmailKind): EmailKindDef {
  return EMAIL_KINDS.find((k) => k.kind === kind) ?? EMAIL_KINDS[0];
}

/** Whether a send of this kind may go out under the admin's switches. */
export function emailKindAllowed(controls: EmailControls | null | undefined, kind: EmailKind): boolean {
  const def = emailKindDef(kind);
  if (def.required) return true;
  if (controls?.kinds?.[kind] === false) return false;
  if (def.group === 'marketing' && controls?.pauseMarketing === true) return false;
  return true;
}

export const EMAIL_PROVIDERS = ['resend', 'brevo'] as const;
export type EmailProvider = typeof EMAIL_PROVIDERS[number];

export function resolveEmailProvider(v: unknown): EmailProvider {
  return v === 'brevo' ? 'brevo' : 'resend';
}

/** "Name <a@b.c>" or a bare address, split for providers that want them apart. */
export function parseFromAddress(from: string): { name: string; email: string } {
  const m = from.trim().match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim(), email: m[2].trim() };
  return { name: '', email: from.trim() };
}
