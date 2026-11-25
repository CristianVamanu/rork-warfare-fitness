// Small in-process cache for expensive public reads.
//
// The public programme catalogue was read from Firestore in full on every
// request (every programme document, schedules included), which capped the
// /programs pages at about three requests a second in a load test. Callers
// now share one result for a short time. While a refresh is running, the
// previous value is served, so a burst of visitors costs one read, not one
// each. Per process: each pm2 instance keeps its own copy.

type Entry<T> = { value?: T; at: number; pending?: Promise<T> };
const store = new Map<string, Entry<unknown>>();

export async function ttlCache<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  let e = store.get(key) as Entry<T> | undefined;
  if (e && e.value !== undefined && now - e.at < ttlMs) return e.value;
  if (!e) { e = { at: 0 }; store.set(key, e as Entry<unknown>); }
  if (!e.pending) {
    const entry = e;
    entry.pending = load()
      .then((v) => { entry.value = v; entry.at = Date.now(); return v; })
      .finally(() => { entry.pending = undefined; });
    // A failed refresh must not become an unhandled rejection for callers
    // that were handed the stale value instead of this promise.
    entry.pending.catch(() => {});
  }
  // Stale value available: serve it now and let the refresh finish behind.
  if (e.value !== undefined) return e.value;
  return e.pending as Promise<T>;
}

/** Test hook. */
export function clearTtlCache(): void { store.clear(); }
