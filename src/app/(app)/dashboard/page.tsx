'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { motion } from 'framer-motion';
import { Moon, Flame, Crosshair, Wind, Dumbbell, Apple, Camera, ChevronRight, Play, RefreshCw, RotateCcw, AlertTriangle, TrendingUp, Trophy, CheckSquare, Swords, Sparkles, Plus, Minus, Target, ClipboardCheck, Droplets, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalDate } from '@/hooks/useLocalDate';
import { skipRestDay, getClientGoals, subscribeTodayCalories, subscribeTodayWater, getTodayWaterLogs, deleteWaterLog, getWeeklySummary, getPersonalBest, markFlameIgnited, resolveProgram, peekResolvedProgram, type WeeklySummary, type PersonalBest } from '@/lib/firestore';
import type { Program } from '@/types';
import { SubscribeSuccess } from '@/components/ui/SubscribeSuccess';
import { logWaterAction } from '@/lib/actions';
import { getMockProgram, stripWeekdayPrefix, getNextSession, getProgramDayProgress, getLastTrainingSlotIndex } from '@/lib/programs';
import { useRouter } from 'next/navigation';
import { getGreeting } from '@/lib/utils';
import { getLevelTier } from '@/lib/xp';
import { deriveStreak, streakCaption } from '@/lib/streakFlame';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { FastingWidget } from '@/components/dashboard/FastingWidget';
import { DailyTip } from '@/components/dashboard/DailyTip';
import { DaysWithoutWidget } from '@/components/dashboard/DaysWithoutWidget';
import { Ring } from '@/components/dashboard/Ring';
import { Medallion } from '@/components/dashboard/Medallion';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import toast from 'react-hot-toast';

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.06 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  },
};

const DEFAULT_GOALS = { calories: 2200, water: 3000 };




export default function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [waterMl, setWaterMl] = useState<number | null>(null);
  const [calories, setCalories] = useState<number | null>(null);
  // Goals live on users/{uid}, the document AuthContext already streams live —
  // reading them here used to mean a second getDoc of that same doc on every
  // dashboard mount, which could also render one frame behind an edit made on
  // the nutrition page. Derived, so it stays in sync for free.
  const goals = useMemo(
    () => ({
      calories: profile?.goals?.calories ?? DEFAULT_GOALS.calories,
      water: profile?.goals?.water ?? DEFAULT_GOALS.water,
    }),
    [profile?.goals?.calories, profile?.goals?.water]
  );
  const [loading, setLoading] = useState(true);
  // Seeded from the last launch so the card is correct on the first frame.
  // Without this an admin-created program has no local stand-in at all and
  // the card renders a wrong day count with no exercises until the network
  // answers. The fetch below still runs and overwrites this.
  const [resolvedProgram, setResolvedProgram] = useState<Program | null>(
    () => peekResolvedProgram(profile?.activeProgram?.programId),
  );
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  // Drives the weekly dots under the flame. Reads through the shared
  // workouts cache in lib/firestore, the same one getPersonalBest below
  // uses, so this is not a second heavy fetch.
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [adjustingWater, setAdjustingWater] = useState(false);
  const [activeGoalCount, setActiveGoalCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getClientGoals(user.uid)
      .then((goals) => setActiveGoalCount(goals.filter((g) => g.status === 'active').length))
      .catch(() => {});
    getWeeklySummary(user.uid).then(setWeeklySummary).catch(() => {});
  }, [user]);

  // Today's calories + water used to arrive from THREE places at once: a
  // one-shot getTodayMeals/getTodayWater pair on mount, these two live
  // listeners, and profile.statsCache. The one-shot pair queried exactly what
  // the listeners already deliver on their first snapshot, so it was a pure
  // duplicate read that also raced them (whichever resolved last won). Now
  // statsCache — already streamed in by AuthContext, costing no read at all —
  // paints instantly, and the listeners are the single source of truth from
  // their first snapshot onward.
  const liveNutritionRef = useRef(false);

  useEffect(() => {
    if (liveNutritionRef.current) return;
    const localDateStr = new Date().toLocaleDateString('sv-SE');
    const cache = profile?.statsCache;
    if (cache && cache.cacheDate === localDateStr) {
      setCalories(cache.caloriesToday ?? 0);
      setWaterMl(cache.waterToday ?? 0);
    }
  }, [profile?.statsCache]);

  useEffect(() => {
    if (!user) return;

    const localDateStr = new Date().toLocaleDateString('sv-SE');
    liveNutritionRef.current = false;

    const markLive = () => {
      liveNutritionRef.current = true;
      setLoading(false);
    };

    const unsubCal = subscribeTodayCalories(user.uid, localDateStr, (v) => {
      setCalories(v);
      markLive();
    });
    const unsubWater = subscribeTodayWater(user.uid, localDateStr, (v) => {
      setWaterMl(v);
      markLive();
    });

    // A listener that errors out (e.g. permission denied) never calls back at
    // all, so loading must not depend solely on a snapshot arriving — the
    // previous one-shot read cleared it in a .finally(). The dashboard renders
    // fine with null totals, so failing open after a moment is correct.
    const loadingGuard = setTimeout(() => setLoading(false), 4000);

    return () => {
      clearTimeout(loadingGuard);
      unsubCal();
      unsubWater();
    };
  }, [user]);

  const greeting = getGreeting();
  const firstName = profile?.displayName?.split(' ')[0] || 'Athlete';
  const powerLevel = profile?.powerLevel ?? 0;
  const tier = getLevelTier(powerLevel);

  // Reactive (see useLocalDate) — the training card's rest-day decision
  // below must move with the calendar, not stay pinned to first render.
  const localDateStr = useLocalDate();
  // Every one of these comes from lib/streakFlame, which is pure and
  // tested. It used to be derived inline here, which made the app's only
  // real jeopardy — train today or the fire goes out — the one significant
  // piece of logic with nothing asserting it.
  const streakView = deriveStreak({
    today: localDateStr,
    lastWorkoutDate: profile?.statsCache?.lastWorkoutDate as string | undefined,
    cachedStreak: profile?.statsCache?.streak ?? profile?.stats?.streak ?? 0,
    completedWorkouts: profile?.activeProgram?.completedWorkouts ?? 0,
    freezeAvailable: profile?.streakFreeze?.available ?? true,
  });
  const { streak, flameState, workedOutToday, savedByFreeze: streakSavedByFreeze } = streakView;
  const streakAtRisk = !loading && streakView.atRisk;

  const WATER_STEP_ML = 250;

  const handleAddWater = async () => {
    if (!user || adjustingWater) return;
    setAdjustingWater(true);
    try {
      await logWaterAction(user.uid, WATER_STEP_ML);
    } catch {
      toast.error('Failed to log water');
    } finally {
      setAdjustingWater(false);
    }
  };

  const handleRemoveWater = async () => {
    if (!user || adjustingWater || !waterMl) return;
    setAdjustingWater(true);
    try {
      const logs = await getTodayWaterLogs(user.uid, localDateStr);
      if (logs.length === 0) return;
      const mostRecent = logs.reduce((a, b) => {
        const aMs = (a.loggedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        const bMs = (b.loggedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
        return bMs > aMs ? b : a;
      });
      await deleteWaterLog(mostRecent.id);
    } catch {
      toast.error('Failed to remove water log');
    } finally {
      setAdjustingWater(false);
    }
  };

  // One-time "ignition" moment — the ember flaring up into a real flame the
  // first time someone actually completes a workout. Deliberately NOT tied
  // to onboarding: firing it before any real progress exists would tell the
  // user "your flame is lit" one second and show an unlit ember with "light
  // it" copy the next — an earned reward that fires before anything's been
  // earned reads as hollow (and confusing). `flameIgnited` is a real
  // Firestore flag (not localStorage) so it fires exactly once ever, on
  // whichever device they finish that first workout on.
  const [igniting, setIgniting] = useState(false);
  const ignitedRef = useRef(false);
  const totalWorkouts = profile?.statsCache?.totalWorkouts ?? profile?.stats?.totalWorkouts ?? 0;
  useEffect(() => {
    if (!user || loading || !profile) return;
    if (profile.flameIgnited) return;
    if (!(totalWorkouts >= 1 && workedOutToday)) return;
    if (ignitedRef.current) return;
    ignitedRef.current = true;
    setIgniting(true);
    toast.success('🔥 Your flame is lit — keep it burning!', { duration: 4500 });
    markFlameIgnited(user.uid).catch(() => {});
    const t = setTimeout(() => setIgniting(false), 2200);
    return () => clearTimeout(t);
  }, [user, loading, profile, totalWorkouts, workedOutToday]);

  // Active program data — single source of truth: lastCompletedDayIndex
  const activeProgram = profile?.activeProgram;
  const completedWorkouts = activeProgram?.completedWorkouts ?? 0;
  const lastCompleted = activeProgram?.lastCompletedDayIndex !== undefined
    ? activeProgram.lastCompletedDayIndex
    : (completedWorkouts > 0 ? completedWorkouts - 1 : -1);
  // resolveProgram is async (Firestore-first), so while it loads the seed
  // copy renders immediately and gets replaced if the admin has saved edits.
  const activeMock = activeProgram ? getMockProgram(activeProgram.programId) : null;
  const programSource = resolvedProgram ?? activeMock;
  // getNextSession is the single shared answer to "what's next" — the next
  // slot after the last completed one, with rest days shown on the day they
  // fall and expiring at the user's own midnight.
  // Always points at the next not-yet-completed session, regardless of
  // workedOutToday — training more than once in a day used to be blocked
  // entirely (this card only offered "Repeat Today" once workedOutToday
  // was true, with no way to actually start the next session until the
  // calendar date rolled over, up to a ~24h wait). getNextSession already
  // advances past lastCompleted and correctly honors/skips a stale rest
  // day via lastWorkoutDate.
  const nextSession = programSource
    ? getNextSession(programSource, lastCompleted, profile?.statsCache?.lastWorkoutDate, localDateStr)
    : null;
  const nextAbsIdx = nextSession?.index ?? lastCompleted + 1;
  const todayDay = nextSession?.day ?? null;
  const isRestToday = nextSession?.isRestToday ?? false;
  // After a skipped rest day the pointer sits on a rest slot — "Repeat" must
  // open the last real session, not that.
  const repeatIdx = programSource ? getLastTrainingSlotIndex(programSource, lastCompleted) : null;
  const [skippingRest, setSkippingRest] = useState(false);
  const handleSkipRest = async () => {
    if (!user || !activeProgram?.programId || !nextSession?.isRestToday) return;
    setSkippingRest(true);
    try {
      const res = await skipRestDay(user.uid, activeProgram.programId, nextSession.index);
      if (!res.ok) {
        toast.error(
          res.reason === 'locked'
            ? 'Your trial covers a limited number of days — upgrade to keep going.'
            : res.reason === 'not-a-rest-day'
            ? 'That session is a workout, not a rest day.'
            : 'Could not skip the rest day. Try again.'
        );
      }
      // profile streams live via AuthContext; the card re-renders on its own.
    } catch {
      toast.error('Could not skip the rest day. Try again.');
    } finally {
      setSkippingRest(false);
    }
  };
  // Guarded against a zero/missing totalWorkouts — enrollInProgram always
  // sets it now, but a legacy activeProgram written before that field
  // existed divides by undefined and renders a literal "NaN%".
  // Progress in DAYS, rest days included (see getProgramDayProgress) —
  // "Day 9 of 84", not "3 of 39 sessions". Falls back to sessions until the
  // program resolves, and for legacy enrollments with no totals.
  const dayProgress = activeProgram
    ? getProgramDayProgress(programSource, activeProgram, nextAbsIdx)
    : null;
  const programPct = dayProgress?.pct ?? 0;

  const firstExerciseName = !isRestToday ? todayDay?.exercises?.[0]?.name : nextSession?.nextTraining?.day.exercises?.[0]?.name;

  const activeProgramId = profile?.activeProgram?.programId;
  useEffect(() => {
    if (!activeProgramId) { setResolvedProgram(null); return; }
    resolveProgram(activeProgramId).then((p) => { if (p) setResolvedProgram(p); }).catch(() => {});
  }, [activeProgramId]);

  useEffect(() => {
    if (!user || !firstExerciseName) { setPersonalBest(null); return; }
    getPersonalBest(user.uid, firstExerciseName).then(setPersonalBest).catch(() => setPersonalBest(null));
  }, [user, firstExerciseName]);

  // Everything visual below reads from the same values as before; only the
  // arrangement changed. Direction C from the approved mockups: a warm
  // aurora behind the header, a gradient hero for today's session, three
  // ring tiles for the day's numbers, and glass for everything else. Glass
  // is the Card's `glass` prop, which resolves to theme tokens, so light
  // mode gets its own values rather than an inverted dark one.
  const sessionCount = todayDay?.exercises?.length ?? 0;
  const dayLabel = todayDay ? stripWeekdayPrefix(todayDay.label) : '';
  const remaining = dayProgress ? Math.max(0, dayProgress.totalDays - dayProgress.daysDone) : 0;
  const programDone = dayProgress?.finished ?? false;
  const caloriesPct = goals.calories > 0 ? (calories ?? 0) / goals.calories : 0;
  const waterPct = goals.water > 0 ? (waterMl ?? 0) / goals.water : 0;
  const glassRow = 'p-3.5 h-full flex items-center gap-3.5 card-float';

  return (
    <>
      {/* Stripe returns here after a successful membership or coaching
          purchase. Paying should land you on the thing you just bought
          access to, not on a settings page. */}
      <Suspense fallback={null}>
        <SubscribeSuccess onSuccess={() => { void refreshProfile(); }} />
      </Suspense>
    <div className="relative">
      <div className="relative">
      <Header />
      <div className="px-4 py-4 space-y-3.5">
        {/* Streak Urgency Banner */}
        {streakAtRisk && (
          <div className="flex items-center gap-3 p-3 bg-amber-400/10 border border-amber-400/30 rounded-2xl wf-rise">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">🔥 {streak}-day streak at risk!</p>
              <p className="text-xs text-amber-400/80">Train today to keep your streak alive.</p>
            </div>
            <Link href="/training">
              <Button size="sm" variant="ghost" className="text-amber-400 border-amber-400/30">Train</Button>
            </Link>
          </div>
        )}

        {/* Greeting */}
        <motion.div {...stagger.item} initial={stagger.item.initial} animate={stagger.item.animate} className="pt-1">
          <div className="min-w-0">
            <p className="text-text-secondary text-sm">{greeting}</p>
            <h1 className="text-[26px] font-black text-white tracking-tight leading-tight truncate">{firstName}</h1>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {streak > 0 && <Badge variant="muted">🔥 {streak} day streak</Badge>}
              <Badge variant="muted"><span className={tier.color}>⚡</span> Lvl {powerLevel} · {tier.title}</Badge>
            </div>
          </div>
        </motion.div>

        {/* Bento Grid — the glanceable stuff, sized by how much it matters */}
        <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-4 auto-rows-[86px] gap-3">

          {/* Streak — hero tile, flame centered behind the number */}
          <motion.div variants={stagger.item} className="col-span-2 row-span-2">
            <Card className="p-4 h-full flex flex-col bg-gradient-to-br from-surface-elevated to-surface relative overflow-hidden card-float">
              <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide relative">Streak</span>

              <div className="flex-1 flex items-center justify-center relative">
                {igniting && (
                  <div
                    className="ignite-flash absolute w-36 h-36 rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgba(255,214,140,0.9) 0%, rgba(245,166,35,0) 70%)' }}
                  />
                )}
                {(() => {
                  const cfg = {
                    blazing:    { glow: 'rgba(245,166,35,0.55)', size: 104, opacity: 0.25, anim: 'flame-glow flame-flicker',      gray: false },
                    flickering: { glow: 'rgba(245,166,35,0.35)', size: 76,  opacity: 0.22, anim: 'flame-glow flame-flicker-weak', gray: false },
                    out:        { glow: 'rgba(120,113,108,0.4)', size: 60,  opacity: 0.20, anim: 'ember-pulse',                   gray: true },
                    unlit:      { glow: 'rgba(120,113,108,0.4)', size: 56,  opacity: 0.18, anim: 'ember-pulse',                   gray: true },
                  }[flameState];
                  return (
                    <>
                      <div
                        className="absolute rounded-full pointer-events-none"
                        style={{ width: cfg.size * 1.3, height: cfg.size * 1.3, background: `radial-gradient(circle, ${cfg.glow} 0%, rgba(0,0,0,0) 70%)` }}
                      />
                      <span
                        key={igniting ? 'igniting' : 'settled'}
                        className={`${igniting ? 'flame-ignite' : cfg.anim} absolute leading-none pointer-events-none select-none`}
                        style={{ fontSize: cfg.size, opacity: igniting ? 1 : cfg.opacity, filter: !igniting && cfg.gray ? 'grayscale(0.75) brightness(0.85)' : undefined }}
                      >
                        🔥
                      </span>
                    </>
                  );
                })()}
                <p className="text-4xl font-black text-white leading-none relative drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                  {streak}<span className="text-lg font-bold text-text-secondary ml-0.5">d</span>
                </p>
              </div>

              {igniting ? (
                <p className="text-[9px] text-center text-accent font-bold mb-1.5 relative">
                  Your flame is lit 🔥
                </p>
              ) : (
                <p className="text-[9px] text-center text-amber-400/80 font-medium mb-1.5 relative">
                  {streakCaption(streakView)}
                </p>
              )}

              {activeMock?.daysPerWeek ? (
                <div className="flex gap-1 relative">
                  {Array.from({ length: activeMock.daysPerWeek }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-1.5 rounded-full ${i < (weeklySummary?.workoutsCompleted ?? 0) ? 'bg-accent' : 'bg-white/8'}`}
                    />
                  ))}
                </div>
              ) : null}
            </Card>
          </motion.div>

          {/* Calories */}
          <motion.div variants={stagger.item} className="col-span-2 row-span-1">
            <Card className="p-3.5 h-full flex flex-col justify-between">
              {loading && calories === null ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Calories</span>
                  </div>
                  <p className="text-lg font-black text-white">
                    {calories ?? 0}<span className="text-xs font-medium text-text-secondary ml-1">/{goals.calories}</span>
                  </p>
                  <ProgressBar value={calories ?? 0} max={goals.calories} color="danger" size="sm" />
                </>
              )}
            </Card>
          </motion.div>

          {/* Water */}
          <motion.div variants={stagger.item} className="col-span-2 row-span-1">
            <Card className="p-3.5 h-full flex flex-col justify-between">
              {loading && waterMl === null ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Water</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRemoveWater}
                        disabled={adjustingWater || !waterMl}
                        aria-label="Remove 250ml"
                        className="w-7 h-7 rounded-full bg-blue-400/10 text-blue-400 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleAddWater}
                        disabled={adjustingWater}
                        aria-label="Add 250ml"
                        className="w-7 h-7 rounded-full bg-blue-400/10 text-blue-400 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-lg font-black text-white">
                    {waterMl ? +(waterMl / 1000).toFixed(2) : 0}<span className="text-xs font-medium text-text-secondary ml-1">/{goals.water / 1000}L</span>
                  </p>
                  <ProgressBar value={waterMl ?? 0} max={goals.water} color="info" size="sm" />
                </>
              )}
            </Card>
          </motion.div>
        </motion.div>

        {/* The day's tip. Renders nothing when there is none. */}
        <DailyTip />

        {/* Today's Workout — hero. Pulled out of the bento grid entirely:
            that grid's rows are a fixed 86px each (auto-rows-[86px]), so any
            fixed row-span here was always wrong for one direction or the
            other — too short clipped the action row off the bottom, too
            tall left a dead gap of empty card below it whenever a shorter
            day (fewer exercises, no personal-best banner) didn't fill the
            reserved space. As its own full-width block outside the grid,
            its height is just whatever its content needs — never clipped,
            never padded with empty space either. */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="mb-3">
            {activeProgram ? (
              <Card className={`p-5 h-full relative overflow-hidden flex flex-col card-float ${isRestToday ? '' : 'border-accent/45 shadow-[0_0_40px_-8px_rgba(245,166,35,0.5)]'}`}>
                {/* The same ember wash and hairline grid the Next Workout
                    card on the program screen uses. The two cards show the
                    same session; they had no business looking like they came
                    from different apps. Replaces a giant 4%-opacity dumbbell
                    watermark, which was the only thing marking this card out
                    and read as a smudge rather than a surface. */}
                {!isRestToday && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: [
                        'radial-gradient(120% 120% at 100% 0%, rgb(var(--accent-rgb) / 0.22) 0%, transparent 55%)',
                        'linear-gradient(rgb(var(--accent-rgb) / 0.06) 1px, transparent 1px)',
                        'linear-gradient(90deg, rgb(var(--accent-rgb) / 0.06) 1px, transparent 1px)',
                      ].join(','),
                      backgroundSize: '100% 100%, 22px 22px, 22px 22px',
                    }}
                  />
                )}
                <div className="relative">
                  {/* Panel header: which program this is, and how far through
                      it you are. The program name had nowhere to live once
                      the title became the session name — and it is the thing
                      that answers "what am I even doing" at a glance, so it
                      gets its own strip rather than being crammed into the
                      eyebrow, where a name like "Kettlebell Warfare" plus a
                      day counter would wrap on any phone.

                      Reads as an instrument panel's label: a live dot, the
                      name tracked out, the counter tabular on the right, a
                      hairline under the lot. Same vocabulary as the section
                      eyebrows on the landing page. */}
                  <div className="flex items-baseline justify-between gap-3 pb-2 mb-3 border-b border-white/8">
                    <p className="flex items-center gap-1.5 min-w-0 text-[10px] font-extrabold uppercase tracking-[0.18em] text-text-tertiary">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                      <span className="truncate">{activeProgram.programName}</span>
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-tertiary tabular-nums flex-shrink-0">
                      {programDone
                        ? 'Complete'
                        : dayProgress?.totalDays
                          ? `Day ${dayProgress.dayNumber} / ${dayProgress.totalDays}`
                          : `Day ${completedWorkouts + 1}`}
                    </p>
                  </div>

                  {/* Icon tile, eyebrow, session title, and the one action —
                      the same header shape as the program screen's card. */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center ${isRestToday ? 'border border-dashed border-white/15 text-text-tertiary' : 'bg-gradient-accent text-black shadow-glow-sm'}`}>
                        {/* Matches the eyebrow: a tick only when the whole
                            program is done. Ticking it merely because today
                            was done sat beside "Up next", which says the
                            opposite. */}
                        {isRestToday ? <Moon className="w-4 h-4" /> : programDone ? <CheckCircle2 className="w-4 h-4" /> : <Dumbbell className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        {/* Describes the session the button will start —
                            never the one just finished. It briefly said
                            "Day 1 complete" while the title, the exercise
                            list and Start underneath all referred to the
                            NEXT day, which is a card labelling itself with
                            the wrong session. The congratulation for the day
                            just done is the green line below.

                            The day counter lives in the strip above now, so
                            this is just the state. Both numbers up there come
                            from getProgramDayProgress and share a unit —
                            pairing a day number with totalWorkouts (a session
                            count) is what produced "Day 1 of 65" on a 91-day
                            program. */}
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-accent/90">
                          {isRestToday ? 'Recovery' : programDone ? 'Program complete' : 'Up next'}
                        </p>
                        {/* No longer falls back to the program name — that
                            is in the strip above, and printing it twice on
                            a rest day made the card look like it had lost
                            track of the session. */}
                        <p className="text-sm font-bold text-white leading-snug truncate">
                          {isRestToday
                            ? 'Rest day'
                            : todayDay
                              ? stripWeekdayPrefix(todayDay.label)
                              : programDone ? 'Every session done' : 'Next session'}
                        </p>
                      </div>
                    </div>
                    {/* Nothing left to start once the program is finished —
                        the button would point at a day past the end. */}
                    {!isRestToday && !programDone && (
                      <Button size="sm" onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${nextAbsIdx}`)}>
                        <Play className="w-4 h-4" /> Start
                      </Button>
                    )}
                  </div>
                  {workedOutToday && completedWorkouts > 0 ? (
                    // No day number here. This counted SESSIONS while the
                    // eyebrow above counts DAYS, so a card could show "Day 1
                    // complete" directly above "Up next · Day 3" and mean
                    // both — rest days are days but not sessions. Saying
                    // "today's session" is true in either unit.
                    <p className="text-sm text-success mt-0.5">
                      🎉 Today&apos;s session is done.
                      {activeProgram.totalWorkouts - completedWorkouts > 0 &&
                        ` ${activeProgram.totalWorkouts - completedWorkouts} session${activeProgram.totalWorkouts - completedWorkouts !== 1 ? 's' : ''} left in the program.`
                      }
                    </p>
                  ) : isRestToday ? (
                    <p className="text-sm text-text-secondary mt-0.5">Rest day — recover, or skip it below</p>
                  ) : null}
                  {/* Full session preview — the card spans 3 grid rows, so a
                      single "Target:" line left a large dead gap between the
                      header and the progress bar. Listing every exercise for
                      today fills that space with the thing the user actually
                      opens this card to know: what's in the session. */}
                  {!isRestToday && (todayDay?.exercises?.length ?? 0) > 0 && (
                    <div className="mt-1 rounded-xl border border-white/8 bg-black/20 divide-y divide-white/6">
                      {todayDay!.exercises.slice(0, 4).map((ex, i) => (
                        <div key={ex.id ?? i} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                          <span className="w-5 text-[10px] font-black text-accent/80 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                          <span className="flex-1 min-w-0 truncate text-text-secondary">{ex.name}</span>
                          <span className="text-text-tertiary text-[11px] font-semibold tabular-nums">{ex.sets}×{ex.reps}</span>
                        </div>
                      ))}
                      {/* The card is a fixed-height grid cell with
                          overflow-hidden — an uncapped list on a 7-exercise
                          day would clip against the border exactly like the
                          button row used to. */}
                      {todayDay!.exercises.length > 4 && (
                        <p className="px-3 py-2 text-[11px] text-text-tertiary">+{todayDay!.exercises.length - 4} more in session</p>
                      )}
                    </div>
                  )}
                  {!isRestToday && personalBest && (
                    <div className="mt-2 flex items-center gap-1.5 p-2 bg-accent/5 border border-accent/20 rounded-lg">
                      <Trophy className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                      <p className="text-xs text-accent">
                        Your best: {personalBest.weight}{profile?.weightUnit ?? 'kg'} × {personalBest.reps}. Beat it today.
                      </p>
                    </div>
                  )}
                </div>

                {/* Was pinned to the bottom of the card via justify-between,
                    which left a huge dead gap above it whenever the content
                    above was short (e.g. no personal-best banner, only 1-2
                    exercises). Flows directly after content now with a
                    fixed margin instead — still never clipped (row-span-4
                    still gives enough headroom for the tallest content
                    case), just no longer stretched away from it. */}
                <div className="mt-4">
                  <div className="mb-3">
                    <ProgressBar value={completedWorkouts} max={activeProgram.totalWorkouts} color={workedOutToday ? 'success' : 'accent'} size="sm" />
                    <p className="text-xs text-text-tertiary mt-1">
                      {/* Both halves in days. programPct comes from
                          getProgramDayProgress (day-based) and was sitting
                          next to a remainder counted in sessions, so a
                          program could read "1% complete · 64 sessions
                          remaining" while the strip above said Day 2 of 91 —
                          three numbers, two units, no way to reconcile them.
                          `remaining` is the day-based figure and already
                          existed for this. */}
                      {programPct}% complete · {remaining} day{remaining === 1 ? '' : 's'} remaining
                    </p>
                  </div>
                  {/* One primary action, full width. Secondary actions in a
                      single evenly-divided row below it — the previous
                      flex-wrap put "Repeat Today / View" on one line and
                      "Switch" orphaned on the next at phone widths. */}
                  {/* No second Start button here. It moved into the header
                      with the session title, matching the program screen —
                      one primary action per card, next to the thing it acts
                      on. A rest day has no session to start, so its skip
                      action stays full width down here. */}
                  <div className="space-y-2">
                    {isRestToday && (
                      <Button fullWidth variant="secondary" loading={skippingRest} onClick={handleSkipRest}>
                        <Moon className="w-4 h-4" /> Skip rest day{nextSession?.nextTraining ? ` · ${stripWeekdayPrefix(nextSession.nextTraining.day.label)}` : ''}
                      </Button>
                    )}
                    <div className={`grid gap-2 ${workedOutToday && repeatIdx !== null ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {workedOutToday && repeatIdx !== null && (
                        <Button size="sm" variant="ghost" className="justify-center" onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${repeatIdx}`)}>
                          <RotateCcw className="w-3.5 h-3.5" /> Repeat
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="justify-center" onClick={() => router.push(`/training/${activeProgram.programId}`)}>
                        <ChevronRight className="w-3.5 h-3.5" /> View
                      </Button>
                      <Button size="sm" variant="ghost" className="justify-center" onClick={() => router.push('/training')}>
                        <RefreshCw className="w-3.5 h-3.5" /> Switch
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <Link href="/training" className="block h-full">
                <Card className="p-4 h-full relative overflow-hidden hover:border-accent/20 transition-colors flex flex-col justify-center card-float">
                  <div className="absolute right-0 bottom-0 opacity-[0.04] pointer-events-none">
                    <Dumbbell className="w-28 h-28 text-accent" />
                  </div>
                  <Badge variant="muted" className="mb-2 self-start">No active program</Badge>
                  <h3 className="text-base font-bold text-white">Choose a Program</h3>
                  <p className="text-sm text-text-secondary mt-1">Pick a training program to get started</p>
                  <Button variant="primary" size="sm" className="mt-3 self-start">Browse Programs</Button>
                </Card>
              </Link>
            )}
        </motion.div>

        {/* Below the fold the screen is three labelled groups, in the order
            a day actually goes: the tools you use, the things you are
            building, and how you recover. The icons sit in tinted badges so
            each tile reads as a button rather than a glyph on glass. */}
        {/* Quick actions — the eight small tiles, as they were. */}
        <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-4 gap-2.5">
          {[
            { icon: Dumbbell, label: 'Workout', href: '/training', tone: 'bg-purple-400/15 text-purple-300' },
            { icon: Apple, label: 'Log food', href: '/nutrition', tone: 'bg-green-400/15 text-green-300' },
            { icon: Camera, label: 'Scan & Go', href: '/training/scan-go', tone: 'bg-blue-400/15 text-blue-300' },
            { icon: CheckSquare, label: 'Habits', href: '/habits', tone: 'bg-indigo-400/15 text-indigo-300' },
            { icon: Sparkles, label: 'Meal ideas', href: '/nutrition/meal-planner', tone: 'bg-orange-400/15 text-orange-300' },
            { icon: TrendingUp, label: 'Progress', href: '/progress', tone: 'bg-teal-400/15 text-teal-300' },
            { icon: Trophy, label: 'Achievements', href: '/achievements', tone: 'bg-yellow-400/15 text-yellow-300' },
            { icon: Swords, label: 'Quests', href: '/quests', tone: 'bg-pink-400/15 text-pink-300' },
          ].map((action) => (
            <motion.div key={action.label} variants={stagger.item}>
              <Link href={action.href} className="block">
                <Card glass className="h-[84px] flex flex-col items-center justify-center gap-2 card-float">
                  <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${action.tone}`}>
                    <action.icon className="w-5 h-5" strokeWidth={1.75} />
                  </span>
                  <span className="text-[10px] font-semibold text-text-secondary text-center leading-tight px-1">{action.label}</span>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-2 gap-2.5">
          {/* Level — personal progression, not a ranking. */}
          <motion.div variants={stagger.item}>
            <Link href="/achievements" className="block h-full">
              <Card glass className="p-4 h-full flex flex-col gap-1 card-float">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Level</span>
                <p className="text-2xl font-black text-white leading-tight tabular-nums">{powerLevel}</p>
                <p className="text-[11px] text-text-tertiary">{(profile?.xp ?? 0).toLocaleString()} XP · {tier.title}</p>
              </Card>
            </Link>
          </motion.div>
          <motion.div variants={stagger.item}>
            <Link href="/community/prs" className="block h-full">
              <Card glass className="p-4 h-full flex flex-col gap-1 card-float">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">PR wall</span>
                  <Trophy className="w-4 h-4 text-accent" strokeWidth={1.75} />
                </div>
                <p className="text-[15px] font-extrabold text-white leading-tight">Post a lift</p>
                <p className="text-[11px] text-text-tertiary">Verified by admin</p>
              </Card>
            </Link>
          </motion.div>
        </motion.div>

        {/* The feature tiles. These were four identical text rows — icon,
            label, sentence, chevron — and read as a settings list. PT test
            and Breathing are now square tiles with a medallion icon and a
            piece of art each; Fasting and Days Without keep their own
            components (they host modals) with the same medallion treatment. */}
        <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-2 gap-2.5">
          <motion.div variants={stagger.item}>
            <Link href="/pt-test" className="block h-full">
              <Card glass className="relative overflow-hidden p-4 h-[156px] flex flex-col justify-between card-float">
                <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full border-[10px] border-accent/10" aria-hidden />
                <div className="absolute right-4 bottom-4 w-10 h-10 rounded-full border-4 border-accent/25" aria-hidden />
                <div className="flex items-start justify-between">
                  <Medallion><Crosshair className="w-6 h-6" strokeWidth={2} /></Medallion>
                  <ChevronRight className="w-4 h-4 text-text-tertiary" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">PT test</span>
                  <p className="text-[15px] font-extrabold text-white leading-tight mt-0.5">Would you pass today?</p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">Real entry standards</p>
                </div>
              </Card>
            </Link>
          </motion.div>

          <motion.div variants={stagger.item}>
            <Link href="/breathing" className="block h-full">
              <Card glass className="relative overflow-hidden p-4 h-[156px] flex flex-col justify-between card-float">
                <motion.div
                  aria-hidden
                  animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.35, 0.7, 0.35] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(var(--accent-rgb) / 0.55) 0%, rgba(var(--accent-rgb) / 0) 68%)' }}
                />
                <div className="flex items-start justify-between">
                  <Medallion><Wind className="w-6 h-6" strokeWidth={2} /></Medallion>
                  <ChevronRight className="w-4 h-4 text-text-tertiary" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Breathing</span>
                  <p className="text-[15px] font-extrabold text-white leading-tight mt-0.5">Reset in 5 minutes</p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">5 guided techniques</p>
                </div>
              </Card>
            </Link>
          </motion.div>

          {activeGoalCount > 0 && (
            <motion.div variants={stagger.item} className="col-span-2">
              <Link href="/goals" className="block">
                <Card glass className="p-4 flex items-center gap-3.5 card-float">
                  <Medallion><Target className="w-6 h-6" strokeWidth={2} /></Medallion>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Goals</span>
                    <p className="text-[15px] font-extrabold text-white leading-tight">{activeGoalCount} active {activeGoalCount === 1 ? 'goal' : 'goals'}</p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">Tap to check in on your progress</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                </Card>
              </Link>
            </motion.div>
          )}
        </motion.div>

        {/* Personal trackers — fasting timer and "days without" streaks keep
            their own components; both host multi-step modals. */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate} className="space-y-2.5 pt-1">
          <FastingWidget />
          <DaysWithoutWidget />
        </motion.div>

      </div>
      </div>
    </div>
    </>
  );
}
