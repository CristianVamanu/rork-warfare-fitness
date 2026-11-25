import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ttlCache, clearTtlCache } from './ttlCache';

describe('ttlCache', () => {
  beforeEach(() => { clearTtlCache(); vi.useRealTimers(); });
  it('loads once for concurrent callers', async () => {
    let n = 0; const load = async () => { n++; await new Promise((r) => setTimeout(r, 10)); return n; };
    const r = await Promise.all([ttlCache('a', 1000, load), ttlCache('a', 1000, load), ttlCache('a', 1000, load)]);
    expect(r).toEqual([1, 1, 1]); expect(n).toBe(1);
  });
  it('reuses within the ttl and refreshes after it, serving stale meanwhile', async () => {
    vi.useFakeTimers();
    let n = 0; const load = async () => ++n;
    expect(await ttlCache('b', 1000, load)).toBe(1);
    expect(await ttlCache('b', 1000, load)).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(await ttlCache('b', 1000, load)).toBe(1); // stale served, refresh started
    await Promise.resolve(); await Promise.resolve();
    expect(await ttlCache('b', 1000, load)).toBe(2);
  });
  it('keeps the old value when a refresh fails', async () => {
    vi.useFakeTimers();
    let fail = false; const load = async () => { if (fail) throw new Error('down'); return 'ok'; };
    expect(await ttlCache('c', 1000, load)).toBe('ok');
    fail = true; vi.advanceTimersByTime(1500);
    expect(await ttlCache('c', 1000, load)).toBe('ok');
  });
  it('propagates the error when there is nothing cached', async () => {
    await expect(ttlCache('d', 1000, async () => { throw new Error('down'); })).rejects.toThrow('down');
  });
});
