'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';

const ITEM_W = 64; // px per item

interface WeightWheelProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
}

export function WeightWheel({
  value,
  onChange,
  step = 2.5,
  max = 300,
  unit = 'kg',
  disabled = false,
}: WeightWheelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const settling = useRef(false);
  const snapTimer = useRef<NodeJS.Timeout>();
  // Track the last value we scrolled to so we only scroll when value truly changes externally
  const scrolledTo = useRef<number | null>(null);

  const values = useMemo(() => {
    const arr: number[] = [];
    for (let v = 0; v <= max; v = parseFloat((v + step).toFixed(10))) {
      arr.push(parseFloat(v.toFixed(2)));
    }
    return arr;
  }, [step, max]);

  const idxFromValue = useCallback(
    (v: number) => Math.round(v / step),
    [step],
  );

  const clampIdx = useCallback(
    (i: number) => Math.max(0, Math.min(values.length - 1, i)),
    [values.length],
  );

  const scrollToIdx = useCallback(
    (idx: number, smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      settling.current = true;
      el.scrollTo({ left: idx * ITEM_W, behavior: smooth ? 'smooth' : 'instant' });
      // Release after animation finishes
      const delay = smooth ? 350 : 0;
      setTimeout(() => {
        settling.current = false;
      }, delay);
    },
    [],
  );

  // Initialise scroll position on mount
  useEffect(() => {
    const idx = clampIdx(idxFromValue(value));
    scrollToIdx(idx, false);
    scrolledTo.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when controlled value changes externally (e.g. duplicate-set)
  useEffect(() => {
    if (scrolledTo.current === value) return;
    const idx = clampIdx(idxFromValue(value));
    scrollToIdx(idx, true);
    scrolledTo.current = value;
  }, [value, idxFromValue, clampIdx, scrollToIdx]);

  const handleScroll = useCallback(() => {
    if (settling.current) return;
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const rawIdx = el.scrollLeft / ITEM_W;
      const snappedIdx = clampIdx(Math.round(rawIdx));
      const newVal = values[snappedIdx];
      // Snap scroll into position
      settling.current = true;
      el.scrollTo({ left: snappedIdx * ITEM_W, behavior: 'smooth' });
      setTimeout(() => { settling.current = false; }, 350);
      if (newVal !== value) {
        scrolledTo.current = newVal;
        onChange(newVal);
      }
    }, 80);
  }, [clampIdx, onChange, value, values]);

  // Visible-center index for styling (derived from controlled value so it
  // updates even while settling)
  const centerIdx = clampIdx(idxFromValue(value));

  const sideCount = 4; // items rendered on each side of visible range (for opacity)

  return (
    <div className="relative select-none" style={{ height: 72 }}>
      {/* Left fade — uses CSS variable so it matches the card background in light/dark mode */}
      <div
        className="absolute left-0 top-0 h-full w-20 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to right, var(--surface) 0%, transparent 100%)' }}
      />
      {/* Right fade */}
      <div
        className="absolute right-0 top-0 h-full w-20 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to left, var(--surface) 0%, transparent 100%)' }}
      />
      {/* Center highlight rails */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-10 pointer-events-none z-10 rounded-xl border border-accent/30"
        style={{ width: ITEM_W + 4 }}
      />

      <div
        ref={scrollRef}
        onScroll={disabled ? undefined : handleScroll}
        className="flex items-center h-full overflow-x-auto weight-wheel-scroll"
        style={{
          scrollSnapType: 'x mandatory',
          paddingLeft: `calc(50% - ${ITEM_W / 2}px)`,
          paddingRight: `calc(50% - ${ITEM_W / 2}px)`,
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
          pointerEvents: disabled ? 'none' : 'auto',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        {values.map((v, i) => {
          const dist = Math.abs(centerIdx - i);
          const opacity = dist === 0 ? 1 : dist === 1 ? 0.55 : dist === 2 ? 0.25 : 0.08;
          const isCenter = dist === 0;
          const isMajor = v % 10 === 0;

          return (
            <button
              key={v}
              tabIndex={-1}
              onClick={() => {
                if (disabled) return;
                const idx = clampIdx(idxFromValue(v));
                scrollToIdx(idx, true);
                scrolledTo.current = v;
                onChange(v);
              }}
              style={{
                minWidth: ITEM_W,
                scrollSnapAlign: 'center',
                opacity,
                transition: 'opacity 0.1s, transform 0.1s',
                transform: isCenter ? 'scale(1.1)' : 'scale(1)',
              }}
              className="flex flex-col items-center justify-center h-full gap-0.5 focus:outline-none"
            >
              <span
                className={`font-black leading-none ${
                  isCenter ? 'text-2xl text-foreground' : 'text-lg text-text-secondary'
                }`}
              >
                {v % 1 === 0 ? v : v.toFixed(1)}
              </span>
              {isMajor && dist <= sideCount && (
                <span className="text-[9px] text-text-tertiary uppercase tracking-wide">
                  {unit}
                </span>
              )}
              {/* tick mark */}
              <div
                className={`rounded-full mt-0.5 ${isMajor ? 'bg-accent/40' : 'bg-border'}`}
                style={{ width: isMajor ? 3 : 2, height: isMajor ? 6 : 4 }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
