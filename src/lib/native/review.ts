/**
 * Google Play / App Store in-app review prompt (the system's own rating
 * sheet, @capacitor-community/in-app-review). Asked at a good moment only:
 * right after a finished workout, once the member has some history, and at
 * most once every 4 months. The OS also rate-limits it and may show
 * nothing; there is no way to know whether a review was left, by design.
 *
 * App versions built before the plugin existed simply reject the call; it
 * is caught and ignored.
 */
import { isNativeApp } from '@/lib/native/health';

const KEY = 'wf-review-asked-at';
const GAP_MS = 120 * 86_400_000;
const MIN_WORKOUTS = 5;

export async function maybeAskForReview(totalWorkouts: number): Promise<void> {
  if (!isNativeApp() || totalWorkouts < MIN_WORKOUTS) return;
  try {
    const last = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - last < GAP_MS) return;
    localStorage.setItem(KEY, String(Date.now()));
  } catch { return; }
  try {
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
  } catch { /* older app build or not supported: nothing to do */ }
}
