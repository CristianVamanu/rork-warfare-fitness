import { describe, it, expect } from 'vitest';
import {
  UNIT_STANDARDS, STANDARD_SLUGS, slugFor, standardBySlug, standardFor,
  formatSeconds, formatMinutes, WHY_GYM_ONLY,
} from './ptStandards';

/**
 * These power public pages that search engines index and people share, so the
 * failure modes are quiet ones. A missing slug 404s a page nobody notices is
 * gone; a duplicate slug makes two units resolve to the same page; a changed
 * slug breaks every link ever posted.
 */

describe('the standards themselves', () => {
  it('every one has a slug', () => {
    for (const s of UNIT_STANDARDS) {
      expect(STANDARD_SLUGS[s.id], `${s.id} has no slug`).toBeTruthy();
    }
  });

  it('no two share a slug', () => {
    const slugs = UNIT_STANDARDS.map((s) => slugFor(s.id));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('slugs are URL-safe', () => {
    for (const s of UNIT_STANDARDS) {
      expect(slugFor(s.id)).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('round-trips slug back to the standard', () => {
    for (const s of UNIT_STANDARDS) {
      expect(standardBySlug(slugFor(s.id))?.id).toBe(s.id);
    }
  });

  it('every one has at least one testable event', () => {
    // A standard with no events renders a page with a test that cannot be
    // taken, which is worse than not having the page.
    for (const s of UNIT_STANDARDS) {
      expect(Object.keys(s.events).length, `${s.id} has no events`).toBeGreaterThan(0);
    }
  });

  it('every one cites where its numbers came from', () => {
    // The sourcing is the only thing separating this from the invented
    // numbers on every other site that publishes these.
    for (const s of UNIT_STANDARDS) {
      expect(s.source.length, `${s.id} has no source`).toBeGreaterThan(10);
    }
  });

  it('names a run label wherever a run time is set', () => {
    // Otherwise the result table says "Run: 19:30" without saying how far.
    for (const s of UNIT_STANDARDS) {
      if (s.events.runMinutes !== undefined) {
        expect(s.runLabel, `${s.id} sets runMinutes with no runLabel`).toBeTruthy();
      }
    }
  });

  it('tests nothing that cannot be done in a gym', () => {
    // Swimming, obstacle courses and open-ground marches belong in notTracked,
    // never in events. The whole promise of the page is that every number on
    // it is one you can actually attempt.
    const allowed = new Set(['pullups', 'pushups', 'situps', 'plankSeconds', 'beepLevel', 'runMinutes']);
    for (const s of UNIT_STANDARDS) {
      for (const key of Object.keys(s.events)) {
        expect(allowed.has(key), `${s.id} tests "${key}", which is not gym-testable`).toBe(true);
      }
    }
  });

  it('never sets a competitive mark easier than the pass mark', () => {
    for (const s of UNIT_STANDARDS) {
      if (!s.competitive) continue;
      for (const k of ['pullups', 'pushups', 'situps', 'plankSeconds', 'beepLevel'] as const) {
        const min = s.events[k]; const comp = s.competitive[k];
        if (min !== undefined && comp !== undefined) {
          expect(comp, `${s.id} ${k}: competitive ${comp} below minimum ${min}`).toBeGreaterThanOrEqual(min);
        }
      }
      // Run is the one where lower is better, so the comparison flips.
      if (s.events.runMinutes !== undefined && s.competitive.runMinutes !== undefined) {
        expect(s.competitive.runMinutes).toBeLessThanOrEqual(s.events.runMinutes);
      }
    }
  });

  it('finds a standard by its internal id too', () => {
    expect(standardFor('recon')?.label).toBe('Marine Recon');
    expect(standardFor('nope')).toBeUndefined();
  });
});

describe('formatting', () => {
  it('renders held times as minutes and seconds', () => {
    expect(formatSeconds(225)).toBe('3:45');
    expect(formatSeconds(60)).toBe('1:00');
    expect(formatSeconds(5)).toBe('0:05');
  });

  it('renders run times from decimal minutes', () => {
    expect(formatMinutes(19.5)).toBe('19:30');
    expect(formatMinutes(10 + 20 / 60)).toBe('10:20');
    expect(formatMinutes(9)).toBe('9:00');
  });
});

describe('the disclaimer', () => {
  it('says plainly that a pass here is not a pass at selection', () => {
    // Load-bearing, legally and ethically. It appears on every public page.
    expect(WHY_GYM_ONLY.caveat.toLowerCase()).toContain('does not mean you would pass selection');
  });
});
