'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Moon, Flame, Dumbbell, Apple, Camera, ChevronRight, Play, RefreshCw, RotateCcw, AlertTriangle, TrendingUp, Trophy, CheckSquare, Swords, Sparkles, Plus, Minus, Target, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { skipRestDay, getClientGoals, subscribeTodayCalories, subscribeTodayWater, getTodayWaterLogs, deleteWaterLog, getWeeklySummary, getPersonalBest, markFlameIgnited, getProgressPhotos, resolveProgram, type WeeklySummary, type PersonalBest } from '@/lib/firestore';
import type { ProgressPhoto, Program } from '@/types';
import { logWaterAction } from '@/lib/actions';
import { getMockProgram, stripWeekdayPrefix, getNextSession, getLastTrainingSlotIndex } from '@/lib/programs';
import { useRouter } from 'next/navigation';
import { getGreeting } from '@/lib/utils';
import { getLevelTier } from '@/lib/xp';
import { Card } from '@/components/ui/Card';
import { FastingWidget } from '@/components/dashboard/FastingWidget';
import { DailyTip } from '@/components/dashboard/DailyTip';
import { DaysWithoutWidget } from '@/components/dashboard/DaysWithoutWidget';
import { Ring } from '@/components/dashboard/Ring';
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
  const { user, profile } = useAuth();
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
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [resolvedProgram, setResolvedProgram] = useState<Program | null>(null);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [adjustingWater, setAdjustingWater] = useState(false);
  const [activeGoalCount, setActiveGoalCount] = useState(0);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);

  useEffect(() => {
    if (!user) return;
    getClientGoals(user.uid)
      .then((goals) => setActiveGoalCount(goals.filter((g) => g.status === 'active').length))
      .catch(() => {});
    getProgressPhotos(user.uid).then(setProgressPhotos).catch(() => {});
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

  const localDateStr = new Date().toLocaleDateString('sv-SE');
  const workedOutToday = (profile?.activeProgram?.completedWorkouts ?? 0) > 0 && profile?.statsCache?.lastWorkoutDate === localDateStr;

  // `stats.streak` is only recomputed when a workout is completed (see
  // completeWorkout() in actions.ts) — there's no daily job that decays it,
  // so it stays stuck at its last value for however many days the user
  // stays away, showing a stale "lit" streak long after it's actually
  // broken. Derive the *real* state here from the day-gap instead of
  // trusting the cached number on its own: 0 days = trained today, 1 day =
  // still salvageable today (the one grace day), 2+ days = the streak is
  // dead until a fresh workout starts a new one — UNLESS a streak freeze
  // is available, which absorbs exactly one missed day and pushes the dead
  // threshold out by one, matching computeStreak()'s own freeze logic in
  // src/lib/events.ts. Without this, a server-side freeze save would be
  // invisible: the UI would still show the streak as dead.
  const lastWorkoutDateStr = profile?.statsCache?.lastWorkoutDate as string | undefined;
  const daysSinceLastWorkout = lastWorkoutDateStr
    ? Math.round((new Date(localDateStr + 'T00:00:00').getTime() - new Date(lastWorkoutDateStr + 'T00:00:00').getTime()) / 86_400_000)
    : null;
  const freezeAvailable = profile?.streakFreeze?.available ?? true;
  const streakBroken = daysSinceLastWorkout !== null && daysSinceLastWorkout >= (freezeAvailable ? 3 : 2);
  const streak = streakBroken ? 0 : (profile?.statsCache?.streak ?? profile?.stats?.streak ?? 0);
  const streakAtRisk = !loading && streak > 0 && !workedOutToday;
  const streakSavedByFreeze = daysSinceLastWorkout === 2 && freezeAvailable && streak > 0;

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

  // Flame state on the streak card — derived from data we already have, no
  // new tracking needed: never-trained users get an unlit ember to invite
  // their first workout; a live streak with today's session done blazes;
  // a live streak with today's session still pending (same "at risk" window
  // as the banner above) flickers as a warning; a broken streak (0, but
  // they've trained before) goes fully out until they start a new one.
  type FlameState = 'unlit' | 'blazing' | 'flickering' | 'out';
  const neverWorkedOut = !profile?.statsCache?.lastWorkoutDate;
  const flameState: FlameState = neverWorkedOut
    ? 'unlit'
    : workedOutToday
    ? 'blazing'
    : streak > 0
    ? 'flickering'
    : 'out';
  const FLAME_COPY: Record<FlameState, string> = {
    unlit: 'Light it — finish your first workout',
    blazing: 'Blazing — keep it going',
    flickering: streakSavedByFreeze ? '🧊 Freeze saved your streak — train today to keep it' : 'Flickering — train today to keep it lit',
    out: "Flame's out — start a new streak today",
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
  // getNextSession is the single shared answer to "what's next" — always the
  // next TRAINING slot after the last completed one; rest slots are skipped.
  // Always points at the next not-yet-completed session, regardless of
  // workedOutToday — training more than once in a day used to be blocked
  // entirely (this card only offered "Repeat Today" once workedOutToday
  // was true, with no way to actually start the next session until the
  // calendar date rolled over, up to a ~24h wait). getNextSession already
  // advances past lastCompleted and correctly honors/skips a stale rest
  // day via lastWorkoutDate.
  const nextSession = programSource
    ? getNextSession(programSource, lastCompleted, profile?.statsCache?.lastWorkoutDate)
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
  const programPct = activeProgram && activeProgram.totalWorkouts
    ? Math.min(100, Math.round((completedWorkouts / activeProgram.totalWorkouts) * 100))
    : 0;

  const firstExerciseName = !isRestToday ? todayDay?.exercises?.[0]?.name : nextSession?.nextTraining?.day.exercises?.[0]?.name;

  useEffect(() => {
    if (!user) return;
    getWeeklySummary(user.uid).then(setWeeklySummary).catch(() => {});
  }, [user]);

  const activeProgramId = profile?.activeProgram?.programId;
  useEffect(() => {
    if (!activeProgramId) { setResolvedProgram(null); return; }
    resolveProgram(activeProgramId).then(setResolvedProgram).catch(() => setResolvedProgram(null));
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
  const remaining = activeProgram ? Math.max(0, activeProgram.totalWorkouts - completedWorkouts) : 0;
  const caloriesPct = goals.calories > 0 ? (calories ?? 0) / goals.calories : 0;
  const waterPct = goals.water > 0 ? (waterMl ?? 0) / goals.water : 0;
  const weekTarget = activeMock?.daysPerWeek ?? 0;
  const weekDone = weeklySummary?.workoutsCompleted ?? 0;
  const glassRow = 'p-3.5 h-full flex items-center gap-3.5 card-float';

  return (
    <div className="relative">
      {/* Aurora: a soft amber wash behind the greeting and the hero, fading
          into the page ground. Decorative, behind everything. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px] -z-0"
        style={{ background: 'radial-gradient(90% 55% at 50% -8%, rgba(var(--accent-rgb) / 0.32), rgba(var(--accent-rgb) / 0) 70%)' }}
      />
      <div className="relative">
      <Header />
      <div className="px-4 py-4 space-y-3.5">
        {/* Streak Urgency Banner */}
        {streakAtRisk && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-3 bg-amber-400/10 border border-amber-400/30 rounded-2xl"
          >
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">🔥 {streak}-day streak at risk!</p>
              <p className="text-xs text-amber-400/80">Train today to keep your streak alive.</p>
            </div>
            <Link href="/training">
              <Button size="sm" variant="ghost" className="text-amber-400 border-amber-400/30">Train</Button>
            </Link>
          </motion.div>
        )}

        {/* Greeting */}
        <motion.div {...stagger.item} initial={stagger.item.initial} animate={stagger.item.animate} className="flex items-start justify-between gap-3 pt-1">
          <div className="min-w-0">
            <p className="text-text-secondary text-sm">{greeting}</p>
            <h1 className="text-[26px] font-black text-white tracking-tight leading-tight truncate">{firstName}</h1>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {streak > 0 && <Badge variant="muted">🔥 {streak} day streak</Badge>}
              <Badge variant="muted"><span className={tier.color}>⚡</span> Lvl {powerLevel} · {tier.title}</Badge>
            </div>
          </div>
          <Link href="/profile" aria-label="Profile" className="w-10 h-10 rounded-full bg-accent-muted text-accent font-extrabold flex items-center justify-center flex-shrink-0 mt-1">
            {firstName.charAt(0).toUpperCase()}
          </Link>
        </motion.div>

        {/* Today's session — the hero. Amber gradient, dark ink, one action. */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
          {activeProgram ? (
            <div
              className="relative overflow-hidden rounded-[28px] p-5 text-[#141005] shadow-[0_30px_70px_-30px_rgba(245,166,35,0.6)]"
              style={{ background: 'linear-gradient(135deg, #F5A623 0%, #E8941A 55%, #B86F0E 100%)' }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="inline-flex items-center h-[26px] px-2.5 rounded-full bg-[#141005]/15 text-[11px] font-extrabold">
                  {workedOutToday && completedWorkouts > 0
                    ? `Day ${Math.max(1, completedWorkouts)} complete`
                    : `Day ${completedWorkouts + 1} of ${activeProgram.totalWorkouts}`}
                </span>
                {!isRestToday && sessionCount > 0 && (
                  <span className="inline-flex items-center h-[26px] px-2.5 rounded-full bg-[#141005]/15 text-[11px] font-extrabold">
                    {sessionCount} movement{sessionCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <h2 className="text-[27px] font-black leading-[1.05] tracking-tight mt-3">
                {isRestToday
                  ? 'Rest day.'
                  : workedOutToday && completedWorkouts > 0
                  ? 'Session done.'
                  : dayLabel
                  ? `${dayLabel}.`
                  : activeProgram.programName}
              </h2>
              <p className="text-[13px] font-semibold mt-1.5 opacity-85">
                {isRestToday
                  ? `${activeProgram.programName} · recover, or skip it below`
                  : workedOutToday && completedWorkouts > 0
                  ? `${activeProgram.programName} · ${remaining} session${remaining !== 1 ? 's' : ''} remaining${todayDay ? ` · next: ${dayLabel}` : ''}`
                  : `${activeProgram.programName}${personalBest ? ` · your best on ${firstExerciseName}: ${personalBest.weight}${profile?.weightUnit ?? 'kg'} × ${personalBest.reps}` : ''}`}
              </p>

              {!isRestToday && sessionCount > 0 && (
                <div className="mt-3 rounded-2xl bg-[#141005]/10 px-3.5 py-1">
                  {todayDay!.exercises.slice(0, 4).map((ex) => (
                    <div key={ex.id} className="flex items-center justify-between text-[13px] py-1.5 border-t border-[#141005]/10 first:border-t-0">
                      <span className="truncate font-semibold">{ex.name}</span>
                      <span className="flex-shrink-0 ml-3 tabular-nums opacity-80">{ex.sets}×{ex.reps}</span>
                    </div>
                  ))}
                  {sessionCount > 4 && (
                    <p className="text-[12px] py-1.5 border-t border-[#141005]/10 opacity-70">+{sessionCount - 4} more in session</p>
                  )}
                </div>
              )}

              <div className="mt-4">
                <div className="h-1.5 rounded-full bg-[#141005]/15 overflow-hidden">
                  <div className="h-full rounded-full bg-[#141005]" style={{ width: `${programPct}%` }} />
                </div>
                <p className="text-[11px] font-semibold mt-1.5 opacity-75">{programPct}% complete · {remaining} session{remaining !== 1 ? 's' : ''} remaining</p>
              </div>

              <div className="mt-3 space-y-2">
                {isRestToday ? (
                  <button
                    onClick={handleSkipRest}
                    disabled={skippingRest}
                    className="w-full h-[52px] rounded-2xl bg-[#141005] text-accent font-extrabold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
                  >
                    <Moon className="w-4 h-4" /> {skippingRest ? 'Skipping…' : `Skip rest day${nextSession?.nextTraining ? ` · ${stripWeekdayPrefix(nextSession.nextTraining.day.label)}` : ''}`}
                  </button>
                ) : (
                  <button
                    onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${nextAbsIdx}`)}
                    className="w-full h-[52px] rounded-2xl bg-[#141005] text-accent font-extrabold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <Play className="w-4 h-4 fill-current" /> {workedOutToday ? 'Start next session' : 'Start session'}
                  </button>
                )}
                <div className={`grid gap-2 ${workedOutToday && repeatIdx !== null ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {workedOutToday && repeatIdx !== null && (
                    <button onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${repeatIdx}`)} className="h-9 rounded-xl bg-[#141005]/12 text-[12px] font-bold flex items-center justify-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Repeat
                    </button>
                  )}
                  <button onClick={() => router.push(`/training/${activeProgram.programId}`)} className="h-9 rounded-xl bg-[#141005]/12 text-[12px] font-bold flex items-center justify-center gap-1.5">
                    <ChevronRight className="w-3.5 h-3.5" /> View program
                  </button>
                  <button onClick={() => router.push('/training')} className="h-9 rounded-xl bg-[#141005]/12 text-[12px] font-bold flex items-center justify-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> Switch
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Link href="/training" className="block">
              <div
                className="rounded-[28px] p-5 text-[#141005] shadow-[0_30px_70px_-30px_rgba(245,166,35,0.6)]"
                style={{ background: 'linear-gradient(135deg, #F5A623 0%, #E8941A 55%, #B86F0E 100%)' }}
              >
                <span className="inline-flex items-center h-[26px] px-2.5 rounded-full bg-[#141005]/15 text-[11px] font-extrabold">No active program</span>
                <h2 className="text-[27px] font-black leading-[1.05] tracking-tight mt-3">Pick your fight.</h2>
                <p className="text-[13px] font-semibold mt-1.5 opacity-85">Choose a program and your first session is written before you get to the gym.</p>
                <div className="mt-4 w-full h-[52px] rounded-2xl bg-[#141005] text-accent font-extrabold text-[15px] flex items-center justify-center gap-2">
                  <Dumbbell className="w-4 h-4" /> Browse programs
                </div>
              </div>
            </Link>
          )}
        </motion.div>

        {/* The day's three numbers as rings */}
        <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-3 gap-2.5">
          <motion.div variants={stagger.item}>
            <Card glass className="p-3 h-full flex flex-col items-center text-center gap-2 relative overflow-hidden">
              {igniting && (
                <div className="ignite-flash absolute inset-0 pointer-events-none rounded-2xl" style={{ background: 'radial-gradient(circle, rgba(255,214,140,0.7) 0%, rgba(245,166,35,0) 70%)' }} />
              )}
              <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Streak</span>
              <Ring value={weekTarget > 0 ? weekDone / weekTarget : streak > 0 ? 1 : 0} size={56} stroke={6}
                color={flameState === 'blazing' || flameState === 'flickering' ? 'var(--accent)' : 'var(--text-tertiary)'}>
                <span className="text-[17px] font-black text-white tabular-nums">{streak}<span className="text-[10px] font-bold text-text-secondary">d</span></span>
              </Ring>
              <p className="text-[10px] leading-tight text-text-tertiary line-clamp-2 px-0.5">
                {igniting ? 'Your flame is lit 🔥' : weekTarget > 0 ? `${weekDone} of ${weekTarget} this week` : FLAME_COPY[flameState]}
              </p>
            </Card>
          </motion.div>

          <motion.div variants={stagger.item}>
            <Card glass className="p-3 h-full flex flex-col items-center text-center gap-2">
              <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Calories</span>
              {loading && calories === null ? <Skeleton className="w-14 h-14 rounded-full" /> : (
                <Ring value={caloriesPct} size={56} stroke={6}>
                  <span className="text-[15px] font-black text-white tabular-nums">{Math.round(caloriesPct * 100)}<span className="text-[10px] font-bold text-text-secondary">%</span></span>
                </Ring>
              )}
              <p className="text-[10px] leading-tight text-text-tertiary tabular-nums">{(calories ?? 0).toLocaleString()} / {goals.calories.toLocaleString()}</p>
            </Card>
          </motion.div>

          <motion.div variants={stagger.item}>
            <Card glass className="p-3 h-full flex flex-col items-center text-center gap-2">
              <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Water</span>
              {loading && waterMl === null ? <Skeleton className="w-14 h-14 rounded-full" /> : (
                <Ring value={waterPct} size={56} stroke={6} color="#3B82F6">
                  <span className="text-[15px] font-black text-white tabular-nums">{waterMl ? +(waterMl / 1000).toFixed(1) : 0}<span className="text-[10px] font-bold text-text-secondary">L</span></span>
                </Ring>
              )}
              <div className="flex items-center gap-2">
                <button onClick={handleRemoveWater} disabled={adjustingWater || !waterMl} aria-label="Remove 250ml"
                  className="w-7 h-7 rounded-full bg-blue-400/10 text-blue-400 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-text-tertiary">of {goals.water / 1000}L</span>
                <button onClick={handleAddWater} disabled={adjustingWater} aria-label="Add 250ml"
                  className="w-7 h-7 rounded-full bg-blue-400/10 text-blue-400 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          </motion.div>
        </motion.div>

        {/* The day's tip. Renders nothing when there is none. */}
        <DailyTip />

        {/* Quick actions — uniform glass tiles, the highest-frequency taps. */}
        <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-4 gap-2.5">
          {[
            { icon: Dumbbell, label: 'Workout', href: '/training' },
            { icon: Apple, label: 'Log food', href: '/nutrition' },
            { icon: Camera, label: 'Scan & Go', href: '/training/scan-go' },
            { icon: CheckSquare, label: 'Habits', href: '/habits' },
            { icon: Sparkles, label: 'Meal ideas', href: '/nutrition/meal-planner' },
            { icon: TrendingUp, label: 'Progress', href: '/progress' },
            { icon: Trophy, label: 'Achievements', href: '/achievements' },
            { icon: Swords, label: 'Quests', href: '/quests' },
          ].map((action) => (
            <motion.div key={action.label} variants={stagger.item}>
              <Link href={action.href} className="block">
                <Card glass className="h-[76px] flex flex-col items-center justify-center gap-1.5 card-float">
                  <action.icon className="w-5 h-5 text-white/80" strokeWidth={1.75} />
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
          {/* PR Wall teaser */}
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

        <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-2.5">
          {/* PT Test */}
          <motion.div variants={stagger.item}>
            <Link href="/pt-test" className="block">
              <Card glass className={glassRow}>
                <div className="w-11 h-11 rounded-2xl bg-accent-muted flex items-center justify-center flex-shrink-0">
                  <ClipboardCheck className="w-5 h-5 text-accent" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">PT test</span>
                  <p className="text-sm font-bold text-white">Find out if you would pass today</p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">Real entry standards, scored against the pass mark</p>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
              </Card>
            </Link>
          </motion.div>

          {/* Breathing */}
          <motion.div variants={stagger.item}>
            <Link href="/breathing" className="block">
              <Card glass className={`${glassRow} relative overflow-hidden`}>
                <div className="relative w-11 h-11 flex-shrink-0 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [0.6, 1, 0.6], opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute w-11 h-11 rounded-full"
                    style={{ background: 'radial-gradient(circle, #F5A623 0%, rgba(245,166,35,0) 72%)' }}
                  />
                  <motion.div animate={{ scale: [0.6, 1, 0.6] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="w-5 h-5 rounded-full bg-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Breathing</span>
                  <p className="text-sm font-bold text-white">Reset in 5 or 10 minutes</p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">5 guided techniques to relax and refocus</p>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
              </Card>
            </Link>
          </motion.div>

          {/* Goals — only once the coach has set one */}
          {activeGoalCount > 0 && (
            <motion.div variants={stagger.item}>
              <Link href="/goals" className="block">
                <Card glass className={glassRow}>
                  <div className="w-11 h-11 rounded-2xl bg-accent-muted flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-accent" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Goals</span>
                    <p className="text-sm font-bold text-white">{activeGoalCount} active {activeGoalCount === 1 ? 'goal' : 'goals'}</p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">Tap to check in on your progress</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                </Card>
              </Link>
            </motion.div>
          )}

          {/* Progress photos — only once one exists */}
          {progressPhotos.length > 0 && (
            <motion.div variants={stagger.item}>
              <Link href="/progress" className="block">
                <Card glass className={glassRow}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={progressPhotos[0].photoUrl} alt="" className="w-11 h-11 rounded-2xl object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Progress photos</span>
                    <p className="text-sm font-bold text-white">{progressPhotos.length} photo{progressPhotos.length === 1 ? '' : 's'} tracked</p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">Tap to view your timeline and compare</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                </Card>
              </Link>
            </motion.div>
          )}
        </motion.div>

        {/* Personal trackers — fasting timer and "days without" streaks keep
            their own components; both host multi-step modals. */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate} className="space-y-2.5">
          <FastingWidget />
          <DaysWithoutWidget />
        </motion.div>

      </div>
      </div>
    </div>
  );
}
