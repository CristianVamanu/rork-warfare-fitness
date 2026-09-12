/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once.
 *
 * For the places that fan out to an external API per record — Stripe in the
 * reconcile job, OpenAI in the notification cron. Strictly sequential is
 * correct and far too slow (5,000 Stripe lookups at ~200ms each is a
 * seventeen-minute cron), and unbounded Promise.all is fast and gets the
 * key rate-limited or the process OOM-killed. A small fixed window is the
 * whole point.
 *
 * Order of completion is not preserved and is not needed by any caller.
 * Errors are the caller's problem: `fn` should catch what it wants to survive,
 * because one rejection here rejects the whole run — the same contract as
 * Promise.all, and deliberate, so a broken batch is loud rather than partial.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const width = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}
