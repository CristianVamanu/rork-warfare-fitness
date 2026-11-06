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
  // Thin edge: faint at the top, amber along the bottom (gradient border),
  // and a small glow just under the card. Mostly dark, like the design.
  border: '1px solid transparent',
  background: 'linear-gradient(180deg, #161310, #0d0b0a) padding-box, linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(245,166,35,0.25) 55%, rgba(255,150,40,0.85) 100%) border-box',
  boxShadow: '0 8px 16px -12px rgba(245,140,20,0.75)',
};

function Gauge({ value, size = 124 }: { value: number; size?: number }) {
  // 270° arc, open at the bottom; thick rounded stroke with an amber glow.
  const R = 62, C = 2 * Math.PI * R, ARC = C * 0.75;
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" role="img" aria-label={`${value} out of 100`}>
      <circle cx="75" cy="75" r={R} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="11" strokeLinecap="round"
        strokeDasharray={`${ARC} ${C}`} transform="rotate(135 75 75)" />
      <circle cx="75" cy="75" r={R} fill="none" stroke="url(#gArc)" strokeWidth="11" strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * ARC} ${C}`} transform="rotate(135 75 75)"
        style={{ filter: 'drop-shadow(0 0 6px rgba(245,150,30,0.85))' }} />
      <defs><linearGradient id="gArc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FF8A1A" /><stop offset="1" stopColor="#FFB547" /></linearGradient></defs>
      <text x="75" y="86" textAnchor="middle" fontSize="44" fontWeight={900} fontStyle="italic" fill="#fff">{value}</text>
      <text x="75" y="111" textAnchor="middle" fontSize="15" fill="rgba(255,255,255,0.6)">/100</text>
    </svg>
  );
}

const ROUND_BTN: React.CSSProperties = { background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.16)' };

function PhotoCard({ href, img, icon: Icon, iconColor = AMBER, title, sub }: { href: string; img: string; icon: React.ElementType; iconColor?: string; title: string; sub: string }) {
  return (
    <Link href={href} className="relative rounded-[15px] overflow-hidden h-[99px] active:scale-[.98] transition-transform" style={GLOW_CARD}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="" className="absolute right-0 top-0 h-[68%] w-[64%] object-cover"
        style={{ maskImage: 'linear-gradient(90deg, transparent 0%, #000 35%)', WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 35%)' }} />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[55%]" style={{ background: 'linear-gradient(180deg, transparent, rgba(12,10,9,0.95) 55%)' }} />
      <span className="absolute left-[8px] top-[8px] w-[30px] h-[30px] rounded-full flex items-center justify-center" style={ROUND_BTN}>
        <Icon className="w-[15px] h-[15px]" style={{ color: iconColor }} strokeWidth={1.9} />
      </span>
      <p className="absolute left-[10px] top-[56px] text-[11px] font-bold text-white leading-none">{title}</p>
      <p className="absolute left-[10px] top-[71px] text-[8px] text-white/65 leading-none truncate max-w-[70px]">{sub}</p>
      <span className="absolute right-[8px] bottom-[8px] w-[21px] h-[21px] rounded-full flex items-center justify-center" style={ROUND_BTN}>
        <ChevronRight className="w-[11px] h-[11px] text-white" strokeWidth={2.5} />
      </span>
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
    // 11pt side margins like the design (the page gives 16).
    <div className="-mx-[5px]">
      {/* Hero: runs up under the transparent header; greeting left, athlete right */}
      <div className="relative -mx-[11px] -mt-[76px] h-[182px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home/hero.webp" alt="" fetchPriority="high" className="absolute -top-[30px] h-[262px] w-auto max-w-none object-cover" style={{ right: '-28px' }} />
        <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg, #0A0A0A 18%, rgba(10,10,10,0) 55%)' }} />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-14" style={{ background: 'linear-gradient(180deg, rgba(10,10,10,0), var(--background))' }} />
        <div className="absolute left-[24px] top-[80px]">
          <h1 className="text-[22px] font-bold text-white tracking-[-0.01em] leading-none">Hello {name}<span aria-hidden className="ml-3 text-[17px] align-[2px]">👑</span></h1>
          <p className="text-[14px] text-white/70 mt-[9px] leading-none">Discipline builds freedom.</p>
          <span aria-hidden className="block mt-[14px] h-[2px] w-[70px] rounded-full" style={{ background: AMBER, boxShadow: '0 0 6px rgba(245,166,35,0.8)' }} />
        </div>
      </div>

      {/* Readiness / weekly score */}
      <div className="relative rounded-[20px] h-[178px] overflow-hidden -mt-[14px]" style={GLOW_CARD}>
        {/* Faint mountain behind the right half of the card. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home/mountain.webp" alt="" aria-hidden className="absolute right-0 top-0 h-full w-[70%] object-cover object-right opacity-70 pointer-events-none" />
        <span className="absolute left-[22px] top-[17px] flex items-center gap-[7px] text-[9.5px] font-semibold tracking-[0.04em] text-white/75 uppercase">
          <Activity className="w-[15px] h-[15px] text-accent" strokeWidth={2} /> {hasWatch ? "Today's readiness" : 'This week'}
        </span>
        <span className="absolute right-[14px] top-[11px] h-[20px] px-[8px] rounded-full flex items-center gap-[4px] text-[7.5px] font-bold text-white" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.14)' }}>
          <Sparkles className="w-[10px] h-[10px] text-accent" /> AI COACH
        </span>
        <div className="absolute left-[18px] top-[36px]"><Gauge value={score} /></div>
        <div aria-hidden className="absolute left-[164px] top-[44px] bottom-[20px] w-px bg-white/10" />
        <div className="absolute left-[184px] right-[14px] top-[44px]">
          <p className="text-[17px] font-bold text-white leading-[1.15]">{headline}</p>
          <p className="text-[11px] text-white/60 mt-[8px] leading-[1.3]">{sub}</p>
          <Link href={startHref} className="mt-[13px] h-[37px] rounded-full flex items-center justify-center gap-[10px] whitespace-nowrap text-[9.5px] font-bold text-black active:scale-[.98] transition-transform"
            style={{ background: 'linear-gradient(180deg, #FFBA4D, #F59A1F)', boxShadow: '0 0 16px rgba(245,150,30,0.55), inset 0 1px 0 rgba(255,255,255,0.4)' }}>
            <Play className="w-[13px] h-[13px] fill-black" /> START WORKOUT <ChevronRight className="w-[13px] h-[13px]" strokeWidth={2.6} />
          </Link>
        </div>
      </div>

      {/* Today's numbers */}
      <div className="grid grid-cols-4 rounded-[17px] h-[80px] mt-[11px] items-center" style={{ ...GLOW_CARD, background: 'linear-gradient(180deg, #121010, #0c0b0a) padding-box, linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06)) border-box', boxShadow: 'none' }}>
        {[
          { icon: Flame, color: AMBER, label: 'Calories', value: kcal.toLocaleString(), unit: `/${kcalGoal}` },
          { icon: Droplet, color: '#3B9BFF', label: 'Water', value: litres, unit: `/${(waterGoalMl / 1000).toFixed(waterGoalMl % 1000 ? 1 : 0)}L` },
          { icon: Dumbbell, color: '#D4D4D4', label: 'Workouts', value: String(workouts), unit: 'Total' },
          { icon: Trophy, color: AMBER, label: 'Streak', value: String(streak), unit: streak === 1 ? 'day' : 'days' },
        ].map((x, i) => (
          <div key={x.label} className="flex flex-col items-center text-center h-[60px] justify-between" style={i ? { borderLeft: '1px solid rgba(255,255,255,0.09)' } : undefined}>
            <x.icon className="w-[17px] h-[17px]" style={{ color: x.color }} strokeWidth={1.9} />
            <span className="text-[7.5px] font-medium text-white/70 uppercase leading-none">{x.label}</span>
            <span className="text-[16px] font-black italic text-white leading-none tabular-nums">{x.value}</span>
            <span className="text-[10px] text-white/65 leading-none">{x.unit}</span>
          </div>
        ))}
      </div>

      {/* Nutrition / Hydration / Recovery */}
      <div className="grid grid-cols-3 gap-[7px] mt-[15px]">
        <PhotoCard href="/nutrition" img="/home/nutrition.webp" icon={Utensils} title="Nutrition" sub="Fuel your goals" />
        <PhotoCard href="/nutrition#water" img="/home/hydration.webp" icon={Droplet} iconColor="#3B9BFF" title="Hydration" sub="Stay optimal" />
        <PhotoCard href="/breathing" img="/home/recovery.webp" icon={Flower2} title="Recovery" sub="Recharge stronger" />
      </div>

      {/* Today's challenge + streak */}
      <div className="grid gap-[11px] mt-[18px]" style={{ gridTemplateColumns: '213fr 145fr' }}>
        <Link href={challenge ? `/community/challenges/${challenge.id}` : '/community/challenges'} className="relative rounded-[17px] h-[119px] active:scale-[.98] transition-transform" style={GLOW_CARD}>
          <span className="absolute left-[15px] top-[14px] flex items-center gap-[12px] text-[9px] font-semibold tracking-[0.03em] text-white/70 uppercase"><Trophy className="w-[15px] h-[15px] text-accent" strokeWidth={2} /> Today&apos;s challenge</span>
          <p className="absolute left-[15px] right-[12px] top-[40px] text-[14px] font-bold text-white leading-none truncate">{challenge?.title ?? 'Pick a challenge'}</p>
          <p className="absolute left-[15px] right-[40px] top-[60px] text-[10px] text-white/65 leading-[1.3]">Hit your target pace and push your limits.</p>
          <span className="absolute left-[15px] top-[93px] text-[9px] text-white/85 leading-none">{challenge ? 'Live now' : 'Browse'}</span>
          <span aria-hidden className="absolute left-[15px] right-[45px] top-[105px] h-[2px] rounded-full bg-white/12" />
          <span className="absolute right-[12px] top-[86px] w-[23px] h-[23px] rounded-full flex items-center justify-center" style={ROUND_BTN}><ChevronRight className="w-[12px] h-[12px] text-white" strokeWidth={2.5} /></span>
        </Link>
        <div className="relative rounded-[17px] h-[119px] overflow-hidden" style={GLOW_CARD}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/flame.webp" alt="" aria-hidden className="absolute -right-[6px] top-[16px] h-[90%] w-auto object-contain"
            style={{ mixBlendMode: 'screen', maskImage: 'radial-gradient(closest-side, #000 55%, transparent)', WebkitMaskImage: 'radial-gradient(closest-side, #000 55%, transparent)', filter: 'brightness(1.35) saturate(1.2)' }} />
          <span className="absolute left-[14px] top-[14px] flex items-center gap-[6px] text-[9px] font-semibold tracking-[0.03em] text-white/70 uppercase"><Flame className="w-[15px] h-[15px] text-accent" strokeWidth={2} /> Your streak</span>
          <p className="absolute left-[16px] top-[40px] flex items-baseline gap-[7px]"><span className="text-[38px] font-black italic text-white leading-none">{streak}</span><span className="text-[10px] font-bold text-white leading-none">{streak === 1 ? 'day' : 'days'}</span></p>
          <p className="absolute left-[15px] top-[98px] text-[9px] font-medium text-accent leading-none">{streak > 0 ? 'Keep it burning!' : "Let's get started!"}</p>
        </div>
      </div>
    </div>
  );
}
