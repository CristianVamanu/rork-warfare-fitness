import { PLAY_STORE_URL } from '@/lib/storeLinks';

/**
 * Google's own "Get it on Google Play" badge, unaltered, as its brand terms
 * require: no recolouring, no cropping. The artwork carries its own clear
 * space, so `height` is the height of the whole image including that margin.
 */
export function GooglePlayBadge({ href = PLAY_STORE_URL, height = 60, className = '' }: { href?: string; height?: number; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play" className={`inline-block active:scale-95 transition-transform ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/google-play-badge.svg" alt="Get it on Google Play" width={Math.round(height * 155 / 60)} height={height} style={{ height, width: 'auto' }} />
    </a>
  );
}
