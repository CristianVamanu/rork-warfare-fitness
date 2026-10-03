import { describe, it, expect } from 'vitest';
import {
  judge, summarise, encodeAnswers, decodeAnswers, resultPath, verdictHeadline,
  parseTime, parseNum, EMPTY_ANSWERS, type Answers,
} from './standardsShare';
import { standardFor, slugFor } from './ptStandards';

const usmc = standardFor('usmc-pft')!;
const answers = (o: Partial<Answers>): Answers => ({ ...EMPTY_ANSWERS, ...o });

describe('parsing what people actually type', () => {
  it('reads mm:ss and decimal minutes alike', () => {
    expect(parseTime('9:30')).toBeCloseTo(9.5);
    expect(parseTime('9.5')).toBeCloseTo(9.5);
    expect(parseTime('')).toBeNull();
    expect(parseTime('soon')).toBeNull();
  });
  it('rejects blank and non-numeric counts', () => {
    expect(parseNum('12')).toBe(12);
    expect(parseNum('  ')).toBeNull();
    expect(parseNum('lots')).toBeNull();
  });
});

describe('judging against the published bar', () => {
  it('scores only the events the unit actually tests', () => {
    // The Marine PFT is three events. Push-ups and sit-ups are not among
    // them, so typing a number into those must not invent a verdict.
    expect(judge(usmc, EMPTY_ANSWERS).map((v) => v.key).sort()).toEqual(['plank', 'pullups', 'run']);
  });

  it('an unattempted event is neither a pass nor a failure', () => {
    const v = judge(usmc, EMPTY_ANSWERS);
    expect(v.every((x) => x.yours === '—')).toBe(true);
    const s = summarise(v);
    expect(s.answered).toBe(0);
    expect(s.failures).toHaveLength(0);
    expect(s.passedAll).toBe(false);
  });

  it('a half-finished test is never a pass', () => {
    // Pull-ups cleared, the other two events left blank.
    const s = summarise(judge(usmc, answers({ pullups: '99' })));
    expect(s.answered).toBe(1);
    expect(s.failures).toHaveLength(0);
    expect(s.passedAll).toBe(false);
  });

  it('run is the one event where lower wins', () => {
    const run = judge(usmc, answers({ run: '1:00' })).find((v) => v.key === 'run');
    expect(run?.passed).toBe(true);
    const slow = judge(usmc, answers({ run: '99:00' })).find((v) => v.key === 'run');
    expect(slow?.passed).toBe(false);
    expect(slow?.gap).toMatch(/too slow/);
  });

  it('names the distance you are short by', () => {
    const v = judge(usmc, answers({ pullups: '20' })).find((x) => x.key === 'pullups');
    expect(v?.passed).toBe(false);
    expect(v?.gap).toBe('3 short');
  });
});

describe('a result that travels as a link', () => {
  it('round-trips the answers somebody typed', () => {
    const a = answers({ pullups: '10', pushups: '60', run: '18:30' });
    const q = new URLSearchParams(encodeAnswers(a));
    expect(decodeAnswers((k) => q.get(k))).toEqual(a);
  });

  it('leaves blanks out of the URL entirely', () => {
    expect(encodeAnswers(EMPTY_ANSWERS)).toBe('');
    expect(resultPath('usmc-pft', EMPTY_ANSWERS)).toBe('/standards/usmc-pft/result');
  });

  it('drops anything that is not a number, a colon or a dot', () => {
    // A shared URL is untrusted: it renders into a page and an image.
    const hostile = new URLSearchParams({ pu: '<script>', ps: '10', su: "'; drop", rn: '18:30' });
    const got = decodeAnswers((k) => hostile.get(k));
    expect(got.pullups).toBe('');
    expect(got.situps).toBe('');
    expect(got.pushups).toBe('10');
    expect(got.run).toBe('18:30');
  });

  it('refuses an absurdly long value rather than rendering it', () => {
    const long = new URLSearchParams({ pu: '1'.repeat(200) });
    expect(decodeAnswers((k) => long.get(k)).pullups).toBe('');
  });

  it('builds a path under the unit it belongs to', () => {
    expect(resultPath(slugFor('usmc-pft'), answers({ pushups: '60' }))).toBe('/standards/usmc-pft/result?ps=60');
  });
});

describe('the line that gets posted', () => {
  const cleared = answers({ pullups: '99', plank: '99:00', run: '0:30' });

  it('states a pass plainly', () => {
    expect(verdictHeadline(usmc, judge(usmc, cleared))).toBe(`I passed the ${usmc.label} standard.`);
  });

  it('phrases a shortfall as a distance, not a failure', () => {
    const line = verdictHeadline(usmc, judge(usmc, { ...cleared, pullups: '1' }));
    expect(line).toBe(`One event short of ${usmc.label}.`);
    expect(line).not.toMatch(/fail/i);
  });

  it('counts several misses', () => {
    const line = verdictHeadline(usmc, judge(usmc, { ...cleared, pullups: '1', run: '99:00' }));
    expect(line).toBe(`2 events short of ${usmc.label}.`);
  });

  it('invites a stranger who has typed nothing', () => {
    expect(verdictHeadline(usmc, judge(usmc, EMPTY_ANSWERS))).toBe(`Could you pass ${usmc.label}?`);
  });
});
