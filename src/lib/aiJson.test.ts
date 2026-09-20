import { describe, it, expect } from 'vitest';
import { withTruncationRetry, parseLooseJson, TruncatedError, BREVITY_ADDENDUM } from './aiJson';

describe('recovering from a truncated generation', () => {
  it('returns the first answer when it fits', async () => {
    const calls: boolean[] = [];
    const out = await withTruncationRetry('PLAN', async (brief) => {
      calls.push(brief);
      return { raw: '{"ok":true}', truncated: false };
    });
    expect(out).toBe('{"ok":true}');
    // No retry, and no money spent on one.
    expect(calls).toEqual([false]);
  });

  it('retries once, asking for brevity — the bug this fixes', async () => {
    // Production hit PLAN_TRUNCATED and threw the whole generation away
    // after the admin had already waited through it.
    const calls: boolean[] = [];
    const out = await withTruncationRetry('PLAN', async (brief) => {
      calls.push(brief);
      return brief
        ? { raw: '{"short":true}', truncated: false }
        : { raw: '{"very long and cut o', truncated: true };
    });
    expect(out).toBe('{"short":true}');
    expect(calls).toEqual([false, true]);
  });

  it('gives up after one retry rather than looping forever', async () => {
    let n = 0;
    await expect(withTruncationRetry('PHASE', async () => {
      n++;
      return { raw: 'cut', truncated: true };
    })).rejects.toThrow(TruncatedError);
    expect(n).toBe(2);
  });

  it('names the stage that failed', async () => {
    await expect(withTruncationRetry('PHASE', async () => ({ raw: '', truncated: true })))
      .rejects.toThrow('PHASE_TRUNCATED');
  });

  it('tells the model to shorten words, not drop training content', () => {
    // A retry must never quietly produce a smaller program.
    expect(BREVITY_ADDENDUM).toMatch(/Shorten the words, not the program/);
  });
});

describe('parsing what the model actually sent', () => {
  it('parses plain JSON', () => {
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    expect(parseLooseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseLooseJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('survives chatter around the object', () => {
    expect(parseLooseJson('Sure! Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it('throws clearly when there is no object at all', () => {
    expect(() => parseLooseJson('I cannot help with that.')).toThrow(/No JSON object/);
  });

  it('does not silently accept genuinely broken JSON', () => {
    // Truncation must still surface as a failure, not a half-program.
    expect(() => parseLooseJson('{"a":1,"b":')).toThrow();
  });
});
