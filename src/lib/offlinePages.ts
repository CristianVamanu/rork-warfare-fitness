'use client';

/**
 * Puts a page into the service worker's 'app-pages' cache (next.config.js)
 * while online, so it opens offline later. Used by the dashboard for the
 * next session's exact URL. Best effort: no cache API, no service worker or
 * a failed fetch just means that page needs a connection.
 */
const CACHE = 'app-pages';
const done = new Set<string>();

export function precachePage(path: string) {
  if (typeof window === 'undefined' || !('caches' in window) || !navigator.onLine) return;
  const url = new URL(path, window.location.origin).toString();
  if (done.has(url)) return;
  done.add(url);
  // Idle time, so it never competes with the screen that is loading.
  const run = () => {
    caches.open(CACHE)
      .then((c) => fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
        .then((r) => (r.ok ? c.put(url, r) : undefined)))
      .catch(() => { done.delete(url); });
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(run); else setTimeout(run, 2000);
}
