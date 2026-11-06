'use client';

/**
 * Top of Home: athlete hero with the greeting, the readiness card (watch
 * readiness, or this week's training score when there is no watch data),
 * today's numbers, the Nutrition / Hydration / Recovery cards, today's
 * challenge and the streak. Dark glass with amber glow, same on web and apps.
 */
import Link from 'next/link';
import { Activity, Sparkles, Play, ChevronRight, Flame, Droplet, Dumbbell, Trophy, Utensils, Flower2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useHealthHistory } from '@/lib/useHealthHistory';
import { readiness } from '@/lib/healthTrends';
import { useHomeChallenge } from './HomeHero';

const AMBER = '#F5A623';
const GLOW_CARD: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015)), rgba(16,14,12,0.78)',
  border: '1px solid rgba(245,166,35,0.35)',
  boxShadow: '0 0 26px rgba(245,166,35,0.18), inset 0 1px 0 rgba(255,255,255,0.06)',
};

function Gauge({ value, size = 150 }: { value: number; size?: number }) {
  // 270° arc, open at the bottom.
  const R = 62, C = 2 * Math.PI * R, ARC = C * 0.75;
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" role="img" aria-label={`${value} out of 100`}>
      <circle cx="75" cy="75" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${ARC} ${C}`} transform="rotate(135 75 75)" />
      <circle cx="75" cy="75" r={R} fill="none" stroke={AMBER} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * ARC} ${C}`} transform="rotate(135 75 75)"
        style={{ filter: 'drop-shadow(0 0 8px rgba(245,166,35,0.8))' }} />
      <text x="75" y="82" textAnchor="middle" fontSize="42" fontWeight={900} fontStyle="italic" fill="#fff">{value}</text>
      <text x="75" y="104" textAnchor="middle" fontSize="13" fill="rgba(255,255,255,0.55)">/100</text>
    </svg>
  );
}

function PhotoCard({ href, img, icon: Icon, title, sub }: { href: string; img: string; icon: React.ElementType; title: string; sub: string }) {
  return (
    <Link href={href} className="relative rounded-[20px] overflow-hidden h-[150px] p-3 flex flex-col justify-end active:scale-[.98] transition-transform" style={GLOW_CARD}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="" className="absolute -right-2 -top-1 h-[60%] aspect-square object-cover" style={{ maskImage: 'radial-gradient(closest-side, #000 60%, transparent)', WebkitMaskImage: 'radial-gradient(closest-side, #000 60%, transparent)' }} />
      <span className="absolute left-3 top-3 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245,166,35,0.3)' }}>
        <Icon className="w-[18px] h-[18px] text-accent" strokeWidth={1.8} />
      </span>
      <p className="relative text-[15px] font-extrabold text-white leading-tight">{title}</p>
      <div className="relative flex items-center justify-between gap-1 mt-0.5">
        <p className="text-[10.5px] text-white/60 truncate">{sub}</p>
        <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <ChevronRight className="w-3.5 h-3.5 text-white" />
        </span>
      </div>
    </Link>
  );
}

export function HomeCommand({ name, kcal, kcalGoal, waterMl, waterGoalMl, workouts, streak, startHref, sessionsThisWeek, daysPerWeek }: {
  name: string; kcal: number; kcalGoal: number; waterMl: number; waterGoalMl: number; workouts: number; streak: number;
  startHref: string; sessionsThisWeek: number; daysPerWeek: number;
}) {
  const { user } = useAuth();
  const { days } = useHealthHistory(user?.uid, 15);
  const ready = readiness(days);
  const challenge = useHomeChallenge();
  // Watch readiness when there is any; otherwise this week's sessions as a score.
  const hasWatch = ready.score != null;
  const weekScore = daysPerWeek > 0 ? Math.round(Math.min(1, sessionsThisWeek / daysPerWeek) * 100) : 0;
  const score = hasWatch ? ready.score! : weekScore;
  const headline = hasWatch
    ? (score >= 80 ? "You're in prime shape." : score >= 60 ? 'Solid. Train smart today.' : 'Go lighter today.')
    : (daysPerWeek > 0 && sessionsThisWeek >= daysPerWeek ? 'Week done. Strong work.' : daysPerWeek > 0 ? `${sessionsThisWeek} of ${daysPerWeek} done this week.` : 'Pick a program to start.');
  const sub = hasWatch ? (score >= 60 ? "Ready to crush today's workout?" : 'Recovery is part of the plan.') : 'Train today and keep the week on track.';
  const litres = (waterMl / 1000).toFixed(waterMl % 1000 ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Hero: greeting on the left, athlete on the right fading into the page */}
      <div className="relative -mx-4 -mt-2 h-[168px] overflow-hidden">
        {/* The art is dark on the left by design, so the greeting sits on it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home/hero.webp" alt="" fetchPriority="high" className="absolute inset-0 w-full h-full object-cover object-[70%_25%]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-16" style={{ background: 'linear-gradient(180deg, transparent, var(--background))' }} />
        <div className="absolute left-4 top-7">
          <h1 className="text-[26px] font-black text-white tracking-tight leading-none">Hello {name} <span aria-hidden>👑</span></h1>
          <p className="text-[14px] text-white/65 mt-1.5">Discipline builds freedom.</p>
          <span aria-hidden className="block mt-2.5 h-[3px] w-20 rounded-full" style={{ background: AMBER, boxShadow: '0 0 10px rgba(245,166,35,0.8)' }} />
        </div>
      </div>

      {/* Readiness / weekly score */}
      <div className="relative rounded-[24px] p-4 overflow-hidden" style={GLOW_CARD}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-white/70 uppercase">
            <Flame className="w-4 h-4 text-accent" /> Your streak
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold text-white rounded-full px-2.5 py-1" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <Sparkles className="w-3 h-3 text-accent" /> AI COACH
          </span>
        </div>
        <div className="flex items-center gap-3 mt-2">
          {/* The streak flame: glowing when lit, dimmed embers at 0. */}
          <div className="relative flex-shrink-0 w-[132px] h-[140px] flex flex-col items-center justify-center">
            <div aria-hidden className="absolute inset-2 rounded-full" style={{ background: streak > 0 ? 'radial-gradient(circle, rgba(245,166,35,0.45), transparent 70%)' : 'radial-gradient(circle, rgba(120,113,108,0.3), transparent 70%)' }} />
            <span aria-hidden className={`absolute text-[104px] leading-none ${streak > 0 ? 'flame-glow flame-flicker' : 'ember-pulse'}`} style={{ opacity: streak > 0 ? 0.9 : 0.35, filter: streak > 0 ? 'drop-shadow(0 0 18px rgba(245,166,35,0.8))' : 'grayscale(0.8) brightness(0.7)' }}>🔥</span>
            <span className="relative text-[46px] font-black italic text-white leading-none mt-6" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}>{streak}</span>
            <span className="relative text-[10px] font-bold tracking-[0.18em] text-white/80 uppercase mt-1" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>{streak === 1 ? 'day' : 'days'}</span>
          </div>
          <div className="w-px self-stretch bg-white/10" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-extrabold text-white leading-tight">{headline}</p>
            <p className="text-[12.5px] text-white/60 mt-1.5 leading-snug">{sub}</p>
            <Link href={startHref} className="mt-3 h-11 px-3 rounded-full flex items-center justify-center gap-1.5 whitespace-nowrap text-[12px] font-black text-black active:scale-[.98] transition-transform"
              style={{ background: 'linear-gradient(180deg, #FFB84A, #F5A623)', boxShadow: '0 0 22px rgba(245,166,35,0.6), inset 0 1px 0 rgba(255,255,255,0.4)' }}>
              <Play className="w-4 h-4 fill-black" /> START WORKOUT <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Today's numbers */}
      <div className="grid grid-cols-4 rounded-[20px] py-3" style={{ ...GLOW_CARD, border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
        {[
          { icon: Flame, color: AMBER, label: 'Calories', value: kcal.toLocaleString(), unit: `/${kcalGoal.toLocaleString()}` },
          { icon: Droplet, color: '#60A5FA', label: 'Water', value: litres, unit: `/${(waterGoalMl / 1000).toFixed(waterGoalMl % 1000 ? 1 : 0)}L` },
          { icon: Dumbbell, color: '#E5E5E5', label: 'Workouts', value: String(workouts), unit: 'Total' },
          { icon: Trophy, color: AMBER, label: 'Streak', value: String(streak), unit: streak === 1 ? 'day' : 'days' },
        ].map((x, i) => (
          <div key={x.label} className="flex flex-col items-center text-center px-1" style={i ? { borderLeft: '1px solid rgba(255,255,255,0.08)' } : undefined}>
            <x.icon className="w-5 h-5" style={{ color: x.color }} strokeWidth={1.8} />
            <span className="text-[9.5px] font-semibold text-white/60 uppercase mt-1.5">{x.label}</span>
            <span className="text-[20px] font-black italic text-white leading-tight tabular-nums">{x.value}</span>
            <span className="text-[11px] text-white/55">{x.unit}</span>
          </div>
        ))}
      </div>

      {/* Nutrition / Hydration / Recovery */}
      <div className="grid grid-cols-3 gap-2.5">
        <PhotoCard href="/nutrition" img="/home/nutrition.webp" icon={Utensils} title="Nutrition" sub="Fuel your goals" />
        <PhotoCard href="/nutrition#water" img="/home/hydration.webp" icon={Droplet} title="Hydration" sub="Stay optimal" />
        <PhotoCard href="/breathing" img="/home/recovery.webp" icon={Flower2} title="Recovery" sub="Recharge stronger" />
      </div>

      {/* Today's challenge + streak */}
      <div className="grid grid-cols-[1.35fr_1fr] gap-2.5">
        <Link href={challenge ? `/community/challenges/${challenge.id}` : '/community/challenges'} className="rounded-[20px] p-3.5 flex flex-col active:scale-[.98] transition-transform" style={GLOW_CARD}>
          <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-white/70 uppercase"><Trophy className="w-4 h-4 text-accent" /> Today&apos;s challenge</span>
          <p className="text-[16px] font-extrabold text-white leading-tight mt-2 line-clamp-2">{challenge?.title ?? 'Pick a challenge'}</p>
          <p className="text-[11.5px] text-white/60 mt-1 leading-snug">Hit your target pace and push your limits.</p>
          <div className="mt-auto pt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-white/70">{challenge ? 'Live now' : 'Browse challenges'}</span>
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}><ChevronRight className="w-3.5 h-3.5 text-white" /></span>
          </div>
        </Link>
        <div className="relative rounded-[20px] p-3.5 overflow-hidden flex flex-col" style={GLOW_CARD}>
          <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-white/70 uppercase"><Activity className="w-4 h-4 text-accent" /> {hasWatch ? 'Readiness' : 'This week'}</span>
          <div className="flex justify-center -mb-3 mt-0.5"><Gauge value={score} size={112} /></div>
        </div>
      </div>
    </div>
  );
}
