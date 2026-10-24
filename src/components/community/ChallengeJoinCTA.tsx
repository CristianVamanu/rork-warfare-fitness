'use client';

import Link from 'next/link';
import { Flame, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The one button on the public challenge page. Where it goes depends on
 * who is looking: a member opens the challenge in the app, a stranger goes
 * through onboarding with ?next= pointing back at the challenge and ?ref=
 * crediting the sharer. Rendered client-side because only the browser
 * knows which of the two it is.
 */
export function ChallengeJoinCTA({ challengeId, live, refCode }: { challengeId: string; live: boolean; refCode: string | null }) {
  const { user, loading } = useAuth();
  const inApp = `/community/challenges/${challengeId}`;
  const joinHref = `/onboarding?next=${encodeURIComponent(inApp)}${refCode ? `&ref=${encodeURIComponent(refCode)}` : ''}`;
  const loginHref = `/login?next=${encodeURIComponent(inApp)}`;

  const cls = 'w-full inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold transition-all';
  if (loading) return <div className={`${cls} bg-white/10 text-white/40`}>…</div>;

  if (user) {
    return (
      <Link href={inApp} className={`${cls} bg-accent text-black shadow-glow-sm`}>
        {live ? <><Flame className="w-5 h-5" /> Open the challenge</> : <>See the board <ArrowRight className="w-5 h-5" /></>}
      </Link>
    );
  }
  return (
    <div className="space-y-2">
      <Link href={joinHref} className={`${cls} bg-accent text-black shadow-glow-sm`}>
        <Flame className="w-5 h-5" /> {live ? 'Join and enter the challenge' : 'Join Warfare Fitness'}
      </Link>
      <p className="text-center text-xs text-white/50">
        Already a member? <Link href={loginHref} className="text-accent font-semibold hover:underline">Log in</Link>
      </p>
    </div>
  );
}
