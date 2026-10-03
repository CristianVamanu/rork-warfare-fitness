import { describe, it, expect } from 'vitest';
import { shouldAnnounce, recordAnnounced } from './purchaseNotice';

describe('announcing a purchase exactly once', () => {
  it('announces the first time', () => {
    expect(shouldAnnounce(null, '1')).toBe(true);
    expect(shouldAnnounce('', '1')).toBe(true);
  });

  it('stays quiet the second time — the bug this fixes', () => {
    // Paid, thanked, then verified an email, which reloads the page with
    // ?subscribed=1 still in the URL. The member must not be told their
    // membership is being unlocked all over again.
    const after = recordAnnounced(null, '1');
    expect(shouldAnnounce(after, '1')).toBe(false);
  });

  it('still announces a different kind of purchase', () => {
    // Membership first, coaching plan later in the same sitting. The second
    // one is a real purchase and deserves its own confirmation.
    const after = recordAnnounced(null, '1');
    expect(shouldAnnounce(after, 'coaching')).toBe(true);
    const both = recordAnnounced(after, 'coaching');
    expect(shouldAnnounce(both, '1')).toBe(false);
    expect(shouldAnnounce(both, 'coaching')).toBe(false);
  });

  it('recording twice changes nothing', () => {
    const once = recordAnnounced(null, '1');
    expect(recordAnnounced(once, '1')).toBe(once);
  });

  it('survives a marker that is empty or malformed', () => {
    expect(shouldAnnounce(',,', '1')).toBe(true);
    expect(recordAnnounced(',,', '1')).toBe('1');
  });

  it('does not let one kind prefix-match another', () => {
    // Guards against a substring check: 'coaching' must not be considered
    // announced because '1' is present, and vice versa.
    expect(shouldAnnounce('coaching', '1')).toBe(true);
    expect(shouldAnnounce('1', 'coaching')).toBe(true);
  });
});
