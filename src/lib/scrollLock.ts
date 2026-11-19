/**
 * One shared lock for "stop the page scrolling behind this overlay".
 *
 * Modals, the chat drawer and the admin menu each used to set
 * `document.body.style.overflow = 'hidden'` themselves and put back whatever
 * they had found. Two of them open at once could leave it stuck: the second
 * remembers 'hidden' as "what was there", the first closes and clears it,
 * then the second closes and restores 'hidden' for good.
 *
 * A stuck `overflow: hidden` on body is not cosmetic. On iOS it makes body a
 * scroll container, and iOS Chrome then lays out position:fixed bars against
 * a viewport that lags its retracting toolbar: the bottom nav floats up the
 * screen while the page scrolls underneath it (see the body rule in
 * globals.css, which exists for the same reason).
 *
 * So the lock is counted. It is on while anything holds it and always fully
 * off when nothing does, whatever order things close in.
 */
let holders = 0;

/** Locks page scroll; call the returned function to release. Safe to call the release twice. */
export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  holders++;
  document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) document.body.style.overflow = '';
  };
}

/** For tests. */
export function scrollLockHolders(): number { return holders; }
