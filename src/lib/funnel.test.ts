import { describe, it, expect } from 'vitest';
import { isFunnelStep, normalizeCampaign, FUNNEL_STEPS } from './funnel';

describe('funnel', () => {
  it('accepts only the known stages', () => {
    expect(isFunnelStep('q1')).toBe(true);
    expect(isFunnelStep('paid')).toBe(true);
    expect(isFunnelStep('q14')).toBe(false);
    expect(isFunnelStep('__proto__')).toBe(false);
    expect(isFunnelStep('ripz_share')).toBe(true);
    expect(FUNNEL_STEPS.length).toBe(24);
  });
  it('turns a campaign tag into a safe token', () => {
    expect(normalizeCampaign('Men_30_50')).toBe('men_30_50');
    expect(normalizeCampaign('a.b/c d')).toBe('abcd');
    expect(normalizeCampaign(undefined)).toBe('direct');
    expect(normalizeCampaign('x'.repeat(80)).length).toBe(40);
  });
});
