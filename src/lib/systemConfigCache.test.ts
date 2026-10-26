import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The cache in front of system/config.
 *
 * Worth testing rather than eyeballing, because the failure modes are quiet
 * ones: a cached timeout would serve "no config" for a minute to everybody,
 * and a cache that survives a write shows an admin their old value straight
 * after saving, which reads as the save having failed.
 */

// Rest-parameter signatures: these stand in for Firestore functions whose real
// overloads we do not care about here, and the calls below forward whatever
// they are given.
const getDocMock = vi.fn<(...args: unknown[]) => unknown>();
const setDocMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);

vi.mock('./firebase', () => ({ db: {}, auth: {}, storage: {} }));

vi.mock('firebase/firestore', async (importActual) => {
  const actual = await importActual<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: () => ({}),
    getDoc: (...args: unknown[]) => getDocMock(...args),
    setDoc: (...args: unknown[]) => setDocMock(...args),
  };
});

const snapshot = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data,
});

let getSystemConfig: typeof import('./firestore')['getSystemConfig'];
let setSystemConfig: typeof import('./firestore')['setSystemConfig'];
let clearSystemConfigCache: typeof import('./firestore')['clearSystemConfigCache'];

beforeEach(async () => {
  vi.useFakeTimers();
  getDocMock.mockReset();
  setDocMock.mockClear();
  const mod = await import('./firestore');
  getSystemConfig = mod.getSystemConfig;
  setSystemConfig = mod.setSystemConfig;
  clearSystemConfigCache = mod.clearSystemConfigCache;
  clearSystemConfigCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getSystemConfig caching', () => {
  it('reads Firestore once and serves the rest from memory', async () => {
    getDocMock.mockResolvedValue(snapshot({ appName: 'Warfare' }));

    expect(await getSystemConfig()).toEqual({ appName: 'Warfare' });
    expect(await getSystemConfig()).toEqual({ appName: 'Warfare' });
    expect(await getSystemConfig()).toEqual({ appName: 'Warfare' });

    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it('shares one read between callers that arrive together', async () => {
    let release: (v: unknown) => void = () => {};
    getDocMock.mockReturnValue(new Promise((res) => { release = res; }));

    const all = Promise.all([getSystemConfig(), getSystemConfig(), getSystemConfig()]);
    release(snapshot({ appName: 'Warfare' }));

    expect(await all).toEqual([{ appName: 'Warfare' }, { appName: 'Warfare' }, { appName: 'Warfare' }]);
    // The cold-start case: several components mount at once and used to make
    // the same request each.
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it('goes back to Firestore once the entry is a minute old', async () => {
    getDocMock.mockResolvedValue(snapshot({ appName: 'Warfare' }));
    await getSystemConfig();

    vi.setSystemTime(Date.now() + 61_000);
    await getSystemConfig();

    expect(getDocMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed read', async () => {
    getDocMock.mockRejectedValueOnce(new Error('offline'));
    await expect(getSystemConfig()).rejects.toThrow('offline');

    getDocMock.mockResolvedValue(snapshot({ appName: 'Warfare' }));
    expect(await getSystemConfig()).toEqual({ appName: 'Warfare' });
    expect(getDocMock).toHaveBeenCalledTimes(2);
  });

  it('caches a missing document as null without re-reading', async () => {
    getDocMock.mockResolvedValue(snapshot(null));

    expect(await getSystemConfig()).toBeNull();
    expect(await getSystemConfig()).toBeNull();
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it('drops the cache when an admin saves, so the new value shows at once', async () => {
    getDocMock.mockResolvedValue(snapshot({ appName: 'Warfare' }));
    await getSystemConfig();

    await setSystemConfig({ appName: 'Warfare Fitness' });
    getDocMock.mockResolvedValue(snapshot({ appName: 'Warfare Fitness' }));

    expect(await getSystemConfig()).toEqual({ appName: 'Warfare Fitness' });
    expect(getDocMock).toHaveBeenCalledTimes(2);
  });
});
