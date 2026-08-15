'use client';

import { motion } from 'framer-motion';

interface WeekProgressLineProps {
  /** 0-based index of today's slot within the current 7-day schedule template. */
  currentDayIndex: number;
  /** How many of this week's slots are already behind the user (0-7). */
  daysLength?: number;
}

// Sits directly under the header on the dashboard, replacing what used to be
// a plain divider line with something that actually means something: which
// day of the CURRENT week of the program the user is on. Every program's
// schedule template is enforced to be exactly 7 entries (see programs.ts),
// so this always maps 1:1 onto the header row's width — a real "day 1 2 3
// 4..." timeline, not a decorative bar.
export function WeekProgressLine({ currentDayIndex, daysLength = 7 }: WeekProgressLineProps) {
  const days = Array.from({ length: daysLength }, (_, i) => i);

  return (
    // Not sticky/fixed on purpose — Header.tsx's own real rendered height
    // isn't a fixed constant (branding logo/name length vary), so pinning
    // this at a guessed pixel offset under it would drift out of alignment
    // depending on content. It just sits in normal flow directly below
    // Header in the dashboard's own JSX instead.
    <div className="px-4 pt-3 pb-4">
      <div className="relative flex items-center justify-between max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
        {/* Base connecting line */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-white/10" />
        {/* Filled portion behind completed days — travels with progress */}
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-px bg-blue-400/60"
          initial={false}
          animate={{ width: daysLength > 1 ? `${(currentDayIndex / (daysLength - 1)) * 100}%` : '0%' }}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />

        {days.map((i) => {
          const isPast = i < currentDayIndex;
          const isToday = i === currentDayIndex;
          return (
            <div key={i} className="relative z-10 flex flex-col items-center gap-1.5">
              {isToday ? (
                <motion.div
                  layoutId="week-progress-dot"
                  className="w-3 h-3 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.7)]"
                  transition={{ type: 'spring', bounce: 0.3, duration: 0.6 }}
                />
              ) : (
                <div className={`w-2 h-2 rounded-full ${isPast ? 'bg-blue-400/60' : 'bg-white/15'}`} />
              )}
              <span className={`text-[10px] font-medium ${isToday ? 'text-blue-400' : isPast ? 'text-text-tertiary' : 'text-white/20'}`}>
                {i + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
