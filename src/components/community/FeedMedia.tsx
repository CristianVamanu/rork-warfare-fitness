'use client';

import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

import { useEffect, useRef, useState } from 'react';

// Sound preference for the session: flips true the first time someone unmutes
// a clip, and every clip that autoplays after that comes in with sound.
let feedUnmuted = false;

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
  // 85vh, not 70. A phone clip is 9:16, and at full post width on a phone
  // that is about 82vh tall. Capped at 70vh the frame had to shrink the clip
  // to keep its shape, so a vertical clip sat narrower than the post. At 85vh
  // it is full width, whole, and tall — the way Instagram shows a Reel in the
  // feed and the way TikTok and Threads show anything vertical. A tall clip
  // taking most of the screen as you scroll past is the deliberate trade for
  // never cropping it and never padding it.
  const box = compact ? 'max-h-40' : 'max-h-[85vh]';
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

  // Plays while it is the thing on screen, pauses when it is not — the feed
  // behaviour of Instagram and TikTok. An IntersectionObserver at 60% means
  // a clip starts once most of it is in view and stops as soon as it is
  // mostly gone, so scrolling past a row of clips never leaves two playing
  // and never downloads a clip nobody is looking at. Pinned previews
  // (compact) stay still. The play() promise is allowed to reject: a browser
  // that refuses autoplay simply leaves the poster and the play glyph.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const resumeAfterScrubRef = useRef(false);
  // Whether the clip is the thing on screen right now. The observer sets
  // it; canplay reads it. The first clip on a page is observed before its
  // metadata has arrived, and play() on a video with nothing loaded
  // rejects and was never retried — so the cover slide of a carousel sat
  // on its play glyph while the second slide, swiped to later, played fine.
  const inViewRef = useRef(false);
  const tryPlay = (el: HTMLVideoElement) => {
    el.muted = !feedUnmuted;
    setMuted(el.muted);
    el.play().catch(() => {
      el.muted = true;
      setMuted(true);
      el.play().catch(() => {});
    });
  };
  useEffect(() => {
    const el = videoRef.current;
    if (!el || kind !== 'video' || compact) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        if (inViewRef.current) {
          // Once someone has unmuted one clip, the next ones come in with
          // sound too, the way Instagram remembers it. If the browser
          // refuses unmuted autoplay it falls back to muted rather than
          // to nothing.
          tryPlay(el);
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.6] },
    );
    io.observe(el);
    return () => { io.disconnect(); el.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, compact]);

  // The frame is the media's exact shape. No crop, no bars — the only way to
  // have neither is for the box to match the picture, so it does.
  //
  // The earlier bars were not this approach failing. The frame was forced to
  // full width while its height was capped, so a tall clip's box came out
  // full-width-but-short, could not match the clip, and showed its own
  // background down both sides. The fix is to cap the WIDTH so the height
  // lands under the ceiling by itself: width = min(100%, 85vh × ratio), and
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
    ? { aspectRatio: String(shape), width: `min(100%, calc(85vh * ${shape}))` }
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

    const togglePlay = () => {
      const el = videoRef.current;
      if (!el) return;
      if (el.paused) el.play().catch(() => {});
      else el.pause();
    };
    const toggleMute = (e: React.MouseEvent) => {
      e.stopPropagation();
      const el = videoRef.current;
      if (!el) return;
      el.muted = !el.muted;
      feedUnmuted = !el.muted;
      setMuted(el.muted);
    };
    // Scrubbing: press, drag along the bar, release. The old handler took a
    // single click, so holding a finger on the line and pulling back did
    // nothing. Pointer capture keeps the drag alive when the finger wanders
    // off the hairline, and the clip is paused for the drag so it does not
    // fight the seek, then resumed if it was playing.
    const seekTo = (clientX: number, bar: HTMLElement) => {
      const el = videoRef.current;
      if (!el || !el.duration) return;
      const r = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      el.currentTime = ratio * el.duration;
      setProgress(ratio);
    };
    const onScrubStart = (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const el = videoRef.current;
      if (!el) return;
      resumeAfterScrubRef.current = !el.paused;
      el.pause();
      e.currentTarget.setPointerCapture(e.pointerId);
      setScrubbing(true);
      seekTo(e.clientX, e.currentTarget);
    };
    const onScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      e.stopPropagation();
      seekTo(e.clientX, e.currentTarget);
    };
    const onScrubEnd = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      e.stopPropagation();
      setScrubbing(false);
      const el = videoRef.current;
      if (el && resumeAfterScrubRef.current) el.play().catch(() => {});
    };

    return (
      <div
        className={`${frame} cursor-pointer select-none`}
        style={frameStyle}
        onClick={togglePlay}
        role="button"
        tabIndex={0}
        aria-label={playing ? 'Pause clip' : 'Play clip'}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay(); } }}
      >
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
          ref={(el) => {
            videoRef.current = el;
            // React sets `muted` as a property, not an attribute, and iOS
            // decides whether muted autoplay is allowed by looking at the
            // attribute. Without it the first clip in a page sits on its
            // play glyph until tapped.
            if (el) { el.defaultMuted = true; el.setAttribute('muted', ''); }
          }}
          src={src}
          poster={poster}
          playsInline
          // Muted is what makes autoplay legal in every browser. Loop because
          // a feed clip that stops dead reads as broken. The browser's own
          // control bar is gone: it is a different design on every platform
          // and none of them match the app. The controls below are ours.
          muted
          loop
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          // The retry: the clip is now playable and, if it is still the one
          // on screen, it starts. Harmless when the observer already did it.
          onCanPlay={(e) => { const v = e.currentTarget; if (inViewRef.current && v.paused && !scrubbing) tryPlay(v); }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration && !scrubbing) setProgress(v.currentTime / v.duration);
          }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
            // No stored poster: seek a hair in so Safari decodes and paints
            // a frame. Only when the clip is NOT the one on screen — for the
            // one that is, the observer has already called play(), and on
            // iOS a seek landing in the middle of play-up leaves the element
            // stuck: no frame, no playing event, play glyph forever. That was
            // the cover slide of every carousel; the slides swiped to later
            // had their metadata (and this seek) long before their play().
            if (!poster && v.paused && v.currentTime === 0 && !inViewRef.current) { try { v.currentTime = 0.1; } catch { /* not seekable yet */ } }
          }}
          // Fetches dimensions and a first frame without pulling the whole
          // clip — a feed of autoloading videos is somebody's data allowance.
          preload="metadata"
          crossOrigin="anonymous"
          className={`relative w-full h-full ${box} object-cover`}
        />

        {/* Paused: one glyph, centred, over the frame. Playing: nothing in
            the middle, so the clip is the clip. */}
        {!playing && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-14 h-14 rounded-full bg-black/40 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg">
              <Play className="w-6 h-6 text-white translate-x-0.5" fill="currentColor" />
            </span>
          </span>
        )}

        {/* Sound, bottom-right. The one control a muted autoplaying feed
            actually needs to hand you. */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black/45 border border-white/15 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Progress, a hairline along the bottom edge. Tap to jump, or hold
            and drag to scrub; it thickens under the finger. Wider hit area
            than it looks, and touch-action none so a horizontal drag is a
            scrub rather than a page scroll. */}
        <div
          onPointerDown={onScrubStart}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubEnd}
          onPointerCancel={onScrubEnd}
          onClick={(e) => e.stopPropagation()}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          style={{ touchAction: 'none' }}
          className="absolute left-0 right-0 bottom-0 h-6 flex items-end"
        >
          <div className={`relative w-full bg-white/20 transition-[height] duration-150 ${scrubbing ? 'h-[6px]' : 'h-[3px]'}`}>
            <div
              className={`h-full bg-accent ${scrubbing ? '' : 'transition-[width] duration-150'}`}
              style={{ width: `${progress * 100}%` }}
            />
            {scrubbing && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-accent shadow-md"
                style={{ left: `${progress * 100}%` }}
              />
            )}
          </div>
        </div>
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
