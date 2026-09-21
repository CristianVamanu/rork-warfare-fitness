/**
 * Take ONE parameter out of the address bar and leave the rest alone.
 *
 * Two screens dismiss a flag they were opened with (?subscribed=, ?switch=)
 * and one of them did it by rewriting the URL to a bare path, which throws
 * away every other parameter with it. Nothing else lives on that URL today,
 * so nothing was lost — but the first thing that does (a campaign tag, a
 * deep link into a tab) would vanish the moment the hint was closed, with
 * no error and nothing in a log.
 *
 * replaceState rather than router.replace: callers run inside effects that
 * other effects have already read the parameter in, and a real navigation
 * would remount the tree underneath them. Nothing needs to re-render.
 */
export function removeQueryParam(name: string): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch { /* nothing depends on this succeeding */ }
}
