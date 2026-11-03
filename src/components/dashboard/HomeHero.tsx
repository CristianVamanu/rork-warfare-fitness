'use client';

/**
 * Top of the home screen: avatar and greeting, the challenge the admin put
 * on the home screen (Admin → Challenges → Show on home, only while it is
 * live) as a big accent banner with a START button, and this week as a date strip with
 * today ringed. Same on web, PWA and the apps.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { getChallenges } from '@/lib/challenges';
import { bucket } from '@/components/community/challengeFormat';
import type { Challenge } from '@/types';

// The banner only changes when an admin flips it, so one read per five
// minutes is plenty; returning to Home must not wait on Firestore again.
let cached: { at: number; c: Challenge | null } | null = null;
const TTL = 5 * 60_000;

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekDates(now = new Date()) {
  const mondayOffset = (now.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset + i));
}

export function HomeHero({ name, photoURL, greeting, badges }: {
  name: string; photoURL?: string | null; greeting: string; badges?: React.ReactNode;
}) {
  const [challenge, setChallenge] = useState<Challenge | null>(cached?.c ?? null);
  useEffect(() => {
    if (cached && Date.now() - cached.at < TTL) return;
    let alive = true;
    getChallenges()
      .then((list) => {
        const c = list.find((x) => x.featuredOnHome && bucket(x) === 'live') ?? null;
        cached = { at: Date.now(), c };
        if (alive) setChallenge(c);
      })
      .catch(() => { /* no banner */ });
    return () => { alive = false; };
  }, []);

  const today = new Date();
  const days = weekDates(today);

  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex items-center gap-3">
        <Link href="/profile" aria-label="Profile" className="rounded-full p-[2px] bg-accent/60 flex-shrink-0">
          <Avatar src={photoURL ?? undefined} name={name} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-extrabold text-white tracking-tight leading-tight truncate">Hello {name} 👋</h1>
          <p className="text-text-secondary text-sm">{greeting}</p>
        </div>
      </div>
      {badges}

      {challenge && (
        <Link
          href={`/community/challenges/${challenge.id}`}
          className="flex items-center gap-3 rounded-full bg-gradient-accent pl-2 pr-2 py-2 active:scale-[.99] transition-transform"
          style={{ boxShadow: '0 10px 30px rgba(var(--accent-rgb) / 0.25)' }}
        >
          <span className="w-12 h-12 rounded-full bg-black/85 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-5 h-5 text-accent" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-black/60">Live challenge</span>
            <span className="block text-[15px] font-extrabold text-black truncate">{challenge.title}</span>
          </span>
          <span className="h-10 px-4 rounded-full bg-black text-white text-xs font-extrabold flex items-center gap-1 flex-shrink-0">
            START <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </Link>
      )}

      <div className="grid grid-cols-7 gap-1" aria-label="This week">
        {days.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className={`text-[11px] font-semibold ${isToday ? 'text-accent' : 'text-text-tertiary'}`}>{DOW[i]}</span>
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold tabular-nums ${isToday ? 'text-white' : 'text-text-secondary'}`}
                style={{ border: `1.5px solid ${isToday ? 'rgb(var(--accent-rgb))' : 'var(--border-subtle)'}`, background: isToday ? 'rgba(var(--accent-rgb) / 0.12)' : 'transparent' }}
                aria-current={isToday ? 'date' : undefined}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
