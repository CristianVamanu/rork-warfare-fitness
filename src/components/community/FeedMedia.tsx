'use client';

import { Play } from 'lucide-react';

import { useState } from 'react';

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
  className = '', poster,}: {
  url: string;
  kind?: 'image' | 'video';
  /** Still frame shown before playback starts. */
  poster?: string;
  alt?: string;
  /** Pinned posts and previews, where the media is context rather than content. */
  compact?: boolean;
  className?: string;
}) {
  // vh rather than a pixel height so a tall photo takes a predictable share of
  // the screen on a phone and on a desktop, instead of dominating one and
  // looking like a thumbnail on the other.
  const box = compact ? 'max-h-40' : 'max-h-[70vh]';
  const frame = `relative mt-3 mx-auto w-full ${box} rounded-xl overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center ${className}`;

  // The frame took the full post width at a fixed max height, and the media
  // was contained inside it — correct in that nothing was cropped, wrong in
  // that a portrait clip sat in a wide black box with heavy bars down both
  // sides, which is the "played weird" look. Instagram sizes the container to
  // the media instead. Once the real dimensions are known (loadedmetadata for
  // video, load for an image) the frame takes that exact ratio, so there are
  // no bars at all; the max height still bounds a very tall portrait so one
  // post cannot push everything else off the screen.
  const [ratio, setRatio] = useState<number | null>(null);

  // The frame is the media's exact shape. No crop, no bars — the only way to
  // have neither is for the box to match the picture, so it does.
  //
  // The earlier bars were not this approach failing. The frame was forced to
  // full width while its height was capped, so a tall clip's box came out
  // full-width-but-short, could not match the clip, and showed its own
  // background down both sides. The fix is to cap the WIDTH so the height
  // lands under the ceiling by itself: width = min(100%, 70vh × ratio), and
  // with aspect-ratio set the height follows at exactly width ÷ ratio. A tall
  // clip is then narrower than the post and centred, which is how iMessage
  // and WhatsApp show it; a wide clip is full width and short. Nothing is
  // trimmed and nothing is padded.
  //
  // Before metadata arrives a video is assumed 9:16, since nearly every clip
  // here is shot on a phone, so the frame barely moves when the real ratio
  // lands.
  const shape = ratio ?? (kind === 'video' ? 9 / 16 : null);
  const frameStyle = shape && !compact
    ? { aspectRatio: String(shape), width: `min(100%, calc(70vh * ${shape}))` }
    : undefined;

  if (kind === 'video') {
    // Three layers so a clip is never a black rectangle before it plays.
    //
    // 1. A stored poster, when the uploader's browser managed to grab one.
    // 2. Failing that, `#t=0.1` on the source. A media fragment makes Safari —
    //    which otherwise paints nothing at all before play, whatever preload
    //    says — decode and show the frame at that timestamp. On every other
    //    browser it is a no-op. Playback starts a tenth of a second in, which
    //    nobody can see.
    // 3. Under both, a branded placeholder with a play glyph, so even the
    //    moments before either frame arrives read as "a clip is here" rather
    //    than "something is broken".
    const src = poster ? url : `${url}#t=0.1`;
    return (
      <div className={frame} style={frameStyle}>
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(var(--accent-rgb) / 0.22), rgba(0,0,0,0.55) 100%)' }}
        >
          <span className="w-12 h-12 rounded-full bg-black/45 border border-white/15 flex items-center justify-center backdrop-blur-sm">
            <Play className="w-5 h-5 text-white translate-x-px" fill="currentColor" />
          </span>
        </div>
        <video
          src={src}
          poster={poster}
          controls
          playsInline
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
          }}
          // Fetches dimensions and a first frame without pulling the whole
          // clip — a feed of autoloading videos is somebody's data allowance.
          preload="metadata"
          crossOrigin="anonymous"
          className={`relative w-full h-full ${box} object-cover`}
        />
      </div>
    );
  }

  return (
    <div className={frame} style={frameStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
        }}
        className={`w-full h-full ${box} object-cover`}
      />
    </div>
  );
}
