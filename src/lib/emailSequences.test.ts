import { describe, it, expect } from 'vitest';
import { SEQUENCES, dueStep, daysSince, sequenceToggles } from './emailSequences';
import { unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl } from './emailUnsubscribe';

const seq = SEQUENCES.winBack; // days 3, 7, 14

describe('which step is due', () => {
  it('sends nothing before the first offset', () => {
    expect(dueStep(seq, 0, {})).toBeNull();
    expect(dueStep(seq, 2, {})).toBeNull();
  });

  it('sends the first step once its day arrives', () => {
    expect(dueStep(seq, 3, {})?.key).toBe('d3');
  });

  it('never sends a stamped step again — the idempotency the cron relies on', () => {
    expect(dueStep(seq, 3, { d3: true })).toBeNull();
    expect(dueStep(seq, 5, { d3: true })).toBeNull();
  });

  it('steps in order and never skips, even after downtime', () => {
    // Cron was down; member is 20 days quiet with nothing sent. They get
    // the FIRST email, not all three at once.
    expect(dueStep(seq, 20, {})?.key).toBe('d3');
    expect(dueStep(seq, 20, { d3: true })?.key).toBe('d7');
    expect(dueStep(seq, 20, { d3: true, d7: true })?.key).toBe('d14');
    expect(dueStep(seq, 20, { d3: true, d7: true, d14: true })).toBeNull();
  });

  it('is silent on nonsense input', () => {
    expect(dueStep(seq, -1, {})).toBeNull();
    expect(dueStep(seq, NaN, {})).toBeNull();
  });

  it('every sequence has ascending offsets and unique keys', () => {
    for (const s of Object.values(SEQUENCES)) {
      const days = s.steps.map((x) => x.day);
      expect([...days].sort((a, b) => a - b)).toEqual(days);
      expect(new Set(s.steps.map((x) => x.key)).size).toBe(s.steps.length);
      for (const st of s.steps) {
        expect(st.subject.length).toBeGreaterThan(0);
        expect(st.cta.path.startsWith('/')).toBe(true);
      }
    }
  });
});

describe('days since', () => {
  it('floors whole days', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(daysSince(0, 3 * day - 1)).toBe(2);
    expect(daysSince(0, 3 * day)).toBe(3);
  });
});

describe('admin toggles', () => {
  it('default to on and honour an explicit off', () => {
    expect(sequenceToggles(null)).toEqual({ leadTips: true, onboardingAbandon: true, winBack: true });
    expect(sequenceToggles({ emailSequences: { winBack: false } }).winBack).toBe(false);
    expect(sequenceToggles({ emailSequences: { winBack: false } }).leadTips).toBe(true);
  });
});

describe('unsubscribe tokens', () => {
  const secret = 'test-secret';

  it('verifies its own token and normalises the address', () => {
    const t = unsubscribeToken(secret, 'Someone@Example.com ', 'lead');
    expect(verifyUnsubscribeToken(secret, 'someone@example.com', 'lead', t)).toBe(true);
  });

  it('cannot be reused for another address, scope or secret', () => {
    const t = unsubscribeToken(secret, 'a@example.com', 'lead');
    expect(verifyUnsubscribeToken(secret, 'b@example.com', 'lead', t)).toBe(false);
    expect(verifyUnsubscribeToken(secret, 'a@example.com', 'user', t)).toBe(false);
    expect(verifyUnsubscribeToken('other', 'a@example.com', 'lead', t)).toBe(false);
  });

  it('rejects garbage without throwing', () => {
    expect(verifyUnsubscribeToken(secret, 'a@example.com', 'lead', '')).toBe(false);
    expect(verifyUnsubscribeToken(secret, 'a@example.com', 'lead', 'short')).toBe(false);
    expect(verifyUnsubscribeToken(secret, 'a@example.com', 'lead', undefined as unknown as string)).toBe(false);
  });

  it('builds a one-click link that carries everything the route needs', () => {
    const url = unsubscribeUrl('https://warfarefitness.com/', secret, 'A@Example.com', 'user');
    expect(url.startsWith('https://warfarefitness.com/api/email/unsubscribe?')).toBe(true);
    expect(url).toContain('e=a%40example.com');
    expect(url).toContain('s=user');
    expect(url).toContain(`t=${unsubscribeToken(secret, 'a@example.com', 'user')}`);
  });
});
