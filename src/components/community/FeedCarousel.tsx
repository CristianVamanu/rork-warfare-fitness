'use client';

import { useRef, useState } from 'react';
import { FeedMedia } from './FeedMedia';
import type { PostMedia } from '@/types';

/**
 * Several photos or clips in one post, swiped sideways the way Instagram does
 * it. One item falls straight through to FeedMedia, so a post with a single
 * attachment renders exactly as it did before carousels existed.
 *
 * Native scroll-snap rather than a JS slider: it is the same gesture the rest
 * of the phone uses, it needs no touch handlers to get wrong, and a clip
 * that scrolls out of view pauses itself through FeedMedia's own observer.
 * Every slide is the width of the post, and the counter + dots come from the
 * scroll position rather than from state the gesture would have to update.
 */
export function FeedCarousel({ items, compact = false, className = '' }: {
  items: PostMedia[];
  compact?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (items.length === 0) return null;
  if (items.length === 1) {
    const [m] = items;
    return <FeedMedia url={m.url} kind={m.type} poster={m.posterURL} compact={compact} className={className} alt={m.type === 'video' ? 'Clip attached to this post' : 'Photo attached to this post'} />;
  }

  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className={`relative mt-3 ${className}`}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none rounded-xl"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        aria-roledescription="carousel"
        aria-label={`${items.length} attachments`}
      >
        {items.map((m, i) => (
          <div key={`${m.url}-${i}`} className="w-full flex-shrink-0 snap-center flex items-center justify-center" aria-label={`${i + 1} of ${items.length}`}>
            {/* FeedMedia adds its own mt-3; the wrapper already carries it. */}
            <FeedMedia url={m.url} kind={m.type} poster={m.posterURL} compact={compact} className="!mt-0" alt={m.type === 'video' ? `Clip ${i + 1} of ${items.length}` : `Photo ${i + 1} of ${items.length}`} />
          </div>
        ))}
      </div>
      {/* "2/6" top-right while swiping, dots underneath — both the Instagram
          convention, so nobody has to learn that the post continues. */}
      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/55 text-[11px] font-semibold text-white tabular-nums pointer-events-none">
        {index + 1}/{items.length}
      </span>
      <div className="flex justify-center gap-1.5 mt-2" aria-hidden="true">
        {items.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-accent' : 'w-1.5 bg-white/25'}`} />
        ))}
      </div>
    </div>
  );
}
