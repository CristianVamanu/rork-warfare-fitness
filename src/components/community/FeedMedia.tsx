'use client';

/**
 * A photo or clip in a feed, shown whole.
 *
 * Every feed used `object-cover` with a fixed max height, which does not scale
 * an image down — it fills the box and cuts off whatever doesn't fit. A phone
 * screenshot (roughly 9:19.5) rendered into a 256px-tall box lost the top and
 * bottom entirely, so a post about a PR showed the middle third of the screen
 * and none of the number. The thing people upload media to show was the part
 * being cropped away.
 *
 * `object-contain` inside a height-bounded box is the fix: the whole frame is
 * always visible, and a very tall portrait is scaled down rather than sliced.
 * The bound still exists — an unbounded 9:19.5 image would push every other
 * post off the screen — but it now limits SIZE rather than removing content.
 *
 * Instagram is the reference and it does something slightly different: it
 * constrains uploads to a range of aspect ratios and crops to fit them. That
 * needs a crop UI at upload time to be fair to the poster. Containing is the
 * honest version of the same idea until that exists.
 *
 * The backdrop matters: a contained image letterboxes, and without something
 * behind it the bars are whatever is underneath, which reads as a rendering
 * fault rather than a deliberate frame.
 */
export function FeedMedia({
  url,
  kind = 'image',
  alt = '',
  compact = false,
  className = '',
}: {
  url: string;
  kind?: 'image' | 'video';
  alt?: string;
  /** Pinned posts and previews, where the media is context rather than content. */
  compact?: boolean;
  className?: string;
}) {
  // vh rather than a pixel height so a tall photo takes a predictable share of
  // the screen on a phone and on a desktop, instead of dominating one and
  // looking like a thumbnail on the other.
  const box = compact ? 'max-h-40' : 'max-h-[70vh]';
  const frame = `mt-3 w-full ${box} rounded-xl overflow-hidden bg-black/40 border border-white/5 ${className}`;

  if (kind === 'video') {
    return (
      <div className={frame}>
        <video
          src={url}
          controls
          playsInline
          // Fetches dimensions and a first frame without pulling the whole
          // clip — a feed of autoloading videos is somebody's data allowance.
          preload="metadata"
          crossOrigin="anonymous"
          className={`w-full h-auto ${box} object-contain`}
        />
      </div>
    );
  }

  return (
    <div className={frame}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`w-full h-auto ${box} object-contain`}
      />
    </div>
  );
}
