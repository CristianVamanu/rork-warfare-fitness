/**
 * The site's own conversion funnel: anonymous daily tallies of how many
 * visitors reach each stage, from the landing page to a paid trial.
 *
 * Why it exists next to GA4 and the Meta Pixel: those only see visitors who
 * accepted cookies and only once their ids are configured, so "where does
 * the quiz lose people" had no answer for anyone who tapped Reject. This
 * counts a stage once per browser session and sends nothing that
 * identifies a person: no cookie, no id, no IP kept. The session-scoped
 * marker exists purely so a refresh does not count twice.
 */

export const FUNNEL_STEPS = [
  'visit', 'lead', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13',
  'reveal', 'start', 'account', 'paid',
] as const;
export type FunnelStep = typeof FUNNEL_STEPS[number];

export function isFunnelStep(v: unknown): v is FunnelStep {
  return typeof v === 'string' && (FUNNEL_STEPS as readonly string[]).includes(v);
}

/** utm_campaign, lower-cased and trimmed to a safe token, or 'direct'. */
export function normalizeCampaign(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) : '';
  return s || 'direct';
}

const SENT_KEY = 'wf.funnel.sent';
const CAMPAIGN_KEY = 'wf.funnel.campaign';

/** The campaign this session arrived under: remembered from the first URL
 *  that carried utm_campaign, so a later step on a clean URL still counts
 *  toward the ad that brought the visitor. */
export function sessionCampaign(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('utm_campaign');
    if (fromUrl) { const c = normalizeCampaign(fromUrl); sessionStorage.setItem(CAMPAIGN_KEY, c); return c; }
    return sessionStorage.getItem(CAMPAIGN_KEY) || 'direct';
  } catch { return 'direct'; }
}

export function funnelHit(step: FunnelStep) {
  try {
    if (typeof window === 'undefined') return;
    let sent: string[] = [];
    try { sent = JSON.parse(sessionStorage.getItem(SENT_KEY) || '[]'); } catch { sent = []; }
    if (sent.includes(step)) return;
    try { sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent, step])); } catch { /* private mode: may double count, never blocks */ }
    const body = JSON.stringify({ step, campaign: sessionCampaign() });
    // sendBeacon survives the page unloading right after (a tap on Start
    // navigates away immediately); fetch with keepalive is the fallback.
    if (navigator.sendBeacon && navigator.sendBeacon('/api/funnel', new Blob([body], { type: 'application/json' }))) return;
    fetch('/api/funnel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* analytics must never break the page */ }
}
