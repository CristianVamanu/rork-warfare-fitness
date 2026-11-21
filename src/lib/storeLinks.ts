/**
 * Store listings.
 *
 * The Android app is live, so its listing is a constant: every "Get it on
 * Google Play" badge works without anyone pasting a URL into Admin. A URL
 * entered there (a campaign link, say) still wins. iOS has no listing yet and
 * stays admin-only — empty means hidden.
 */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.warfarefitness.app';

/** Served from the site so emails can load it; PNG because mail clients drop SVG. */
export const PLAY_BADGE_PNG = 'https://warfarefitness.com/brand/google-play-badge.png';

/** Google's badge terms ask for this line wherever the badge appears. */
export const PLAY_TRADEMARK_LINE = 'Google Play and the Google Play logo are trademarks of Google LLC.';

export function androidStoreUrl(configured?: unknown): string {
  return (typeof configured === 'string' && configured.trim()) || PLAY_STORE_URL;
}
