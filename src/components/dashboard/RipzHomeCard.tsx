'use client';

/**
 * Ripz on the dashboard. While a 30-day challenge is running it shows the
 * day and whether today's pack is still to do, and opens the challenge;
 * otherwise it is the plain "Rip a pack" link into free play.
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
  return (
    <Link href={active ? '/ripz/challenge' : '/ripz/play'} className="flex items-center gap-3 p-3 rounded-2xl border border-accent/30 bg-accent/[0.07] wf-rise">
      <span className="w-10 h-12 rounded-md ripz-foil flex items-center justify-center text-[10px] font-black italic text-black/85 -rotate-6">RIPZ</span>
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
            <span className="block text-sm font-black text-white">Rip a pack</span>
            <span className="block text-xs text-text-secondary">Swipe it open. Do what it deals. Or take on the 30-day challenge.</span>
          </>
        )}
      </span>
      {active && v.doneToday ? <Check className="w-4 h-4 text-accent" /> : <ChevronRight className="w-4 h-4 text-accent" />}
    </Link>
  );
}
