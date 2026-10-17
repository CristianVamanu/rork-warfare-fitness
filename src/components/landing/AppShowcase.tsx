'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CornerBrackets } from '@/components/landing/chrome';

/**
 * "What's inside": the real app, one screen per card, right under the hero.
 *
 * A visitor is asked for money on this page before they have seen a single
 * screen of the product; this is the section that fixes that. Renders are
 * the app's own UI, untouched. Captions say what the screen does for you,
 * not what it is called.
 *
 * One layout for every width: a scroll-snap strip. On a phone one card
 * fills the width and a thumb swipes; on a desktop three sit side by side
 * and the arrows page through. No JS carousel library, no autoplay, so it
 * cannot jank on a slow phone.
 */
export interface ShowcaseItem { src: string; title: string; caption: string }

export const DEFAULT_SHOWCASE: ShowcaseItem[] = [
  { src: '/showcase/01.webp', title: "Today's session, already written", caption: 'Open the app and the day is planned. Every exercise, sets, reps, and your best lift to beat.' },
  { src: '/showcase/02.webp', title: 'It tells you what to beat', caption: 'Remembers last time, sets the target for this set, runs the rest timer. You just lift.' },
  { src: '/showcase/03.webp', title: 'Photo your plate. Logged.', caption: 'Calories and macros from a photo, with a portion slider. Estimates, and honest about it.' },
  { src: '/showcase/04.webp', title: 'Macros, water, one screen', caption: 'Daily targets set from your stats. Tap to add water. Barcode and meal ideas built in.' },
  { src: '/showcase/05.webp', title: 'Proof you showed up', caption: 'Streaks, XP, leaderboard, PR wall. Consistency you can see.' },
  { src: '/showcase/06.webp', title: 'Every set counted', caption: 'Weight and reps in two taps, effort noted, rest timed. Nothing to remember.' },
  { src: '/showcase/07.webp', title: 'Your home screen', caption: 'Streak, calories, water and the next session, the moment you open it.' },
];

export function AppShowcase({ items = DEFAULT_SHOWCASE }: { items?: ShowcaseItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [canPage, setCanPage] = useState({ prev: false, next: true });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const card = el.firstElementChild as HTMLElement | null;
      const w = card ? card.offsetWidth + 16 : 1;
      setIndex(Math.round(el.scrollLeft / w));
      setCanPage({ prev: el.scrollLeft > 8, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 8 });
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Screens from inside the app"
      >
        {items.map((it, i) => (
          <figure
            key={it.src}
            className="snap-center shrink-0 w-[86vw] max-w-[420px] sm:w-[calc((100%-2rem)/3)] sm:max-w-none"
          >
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black aspect-[4/3]">
              <CornerBrackets size="w-3.5 h-3.5" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.src}
                alt={it.title}
                loading={i < 2 ? 'eager' : 'lazy'}
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
              <span className="absolute top-3 left-3 wf-readout text-[10px] font-bold text-accent bg-black/60 border border-accent/25 rounded-md px-2 py-1">
                {String(i + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
              </span>
            </div>
            <figcaption className="mt-3 px-0.5">
              <p className="text-sm font-bold text-white">{it.title}</p>
              <p className="text-xs text-text-secondary leading-relaxed mt-1">{it.caption}</p>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Dots on every width; arrows only where there is a pointer. */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-1.5" aria-hidden>
          {items.map((_, i) => (
            <span key={i} className={`h-1 rounded-full transition-all ${i === index ? 'w-6 bg-accent' : 'w-2 bg-white/20'}`} />
          ))}
        </div>
        <div className="hidden sm:flex gap-2">
          <button type="button" onClick={() => page(-1)} disabled={!canPage.prev} aria-label="Previous screens"
            className="w-9 h-9 rounded-full border border-white/10 bg-surface/60 text-white flex items-center justify-center disabled:opacity-30 hover:border-accent/50 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => page(1)} disabled={!canPage.next} aria-label="Next screens"
            className="w-9 h-9 rounded-full border border-white/10 bg-surface/60 text-white flex items-center justify-center disabled:opacity-30 hover:border-accent/50 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
