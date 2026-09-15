import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './concurrency';

const tick = () => new Promise<void>((r) => setTimeout(r, 1));

describe('mapWithConcurrency', () => {
  it('visits every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => { await tick(); seen.push(n); });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('never has more than `limit` calls in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    });
    expect(peak).toBe(4);
  });

  it('is actually concurrent, not sequential in disguise', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    });
    expect(peak).toBe(3);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    let calls = 0;
    await mapWithConcurrency([], 10, async () => { calls++; });
    expect(calls).toBe(0);
    await mapWithConcurrency([1], 10, async () => { calls++; });
    expect(calls).toBe(1);
  });

  it('rejects the whole run if one call throws — same contract as Promise.all', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('boom'); }),
    ).rejects.toThrow('boom');
  });
});
