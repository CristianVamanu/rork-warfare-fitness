'use client';

/**
 * Ripz on the dashboard. With no challenge running it is a plain "Ripz" card
 * into the Ripz page, where the 30-day challenge is offered. Once a
 * challenge is running it shows the day and whether today's pack is still to
 * do, and opens the challenge.
 */
import Link from 'next/link';
import { ChevronRight, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalDate } from '@/hooks/useLocalDate';
import { challengeView, CHALLENGE_DAYS, type ChallengeRecord } from '@/lib/ripzChallenge';

export function RipzHomeCard() {
  const { profile } = useAuth();
  const today = useLocalDate();
  const rec = (profile as unknown as { ripzChallenge?: ChallengeRecord } | null)?.ripzChallenge ?? null;
  const v = challengeView(rec, today);
  const active = v.state === 'active';
  const card = (
    <Link href={active ? '/ripz/challenge' : '/ripz/play'} className="flex items-center gap-3 p-3 rounded-2xl border border-accent/30 bg-accent/[0.07] wf-rise">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ripz/gold_sm.webp" alt="" className="w-9 h-auto -rotate-6 drop-shadow-[0_4px_10px_rgba(245,166,35,0.45)]" />
      <span className="flex-1">
        {active ? (
          <>
            <span className="block text-sm font-black text-white">Ripz challenge · Day {v.day} of {CHALLENGE_DAYS}</span>
            <span className="block text-xs text-text-secondary">
              {v.doneToday ? 'Done for today. Come back tomorrow.' : `Today's pack is waiting: ${v.range.min}–${v.range.max} reps.`}
            </span>
          </>
        ) : (
          <>
            <span className="block text-sm font-black text-white">Ripz</span>
            <span className="block text-xs text-text-secondary">Rip a pack. Do what it deals.</span>
          </>
        )}
      </span>
      {active && v.doneToday ? <Check className="w-4 h-4 text-accent" /> : <ChevronRight className="w-4 h-4 text-accent" />}
    </Link>
  );
  // In a challenge the card opens the challenge; normal Ripz stays one tap away.
  if (!active) return card;
  return (
    <div className="space-y-1.5">
      {card}
      <Link href="/ripz/play" className="block text-center text-xs font-semibold text-accent py-1">Or spin the wheel in free play ›</Link>
    </div>
  );
}
