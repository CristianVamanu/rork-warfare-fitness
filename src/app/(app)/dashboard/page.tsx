'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Flame, Droplets, Dumbbell, Apple, Camera, ChevronRight, Play, Moon, RefreshCw, RotateCcw, AlertTriangle, CheckCircle2, TrendingUp, Trophy, CheckSquare, Swords, Sparkles, Plus, Minus, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserGoals, getClientGoals, subscribeTodayCalories, subscribeTodayWater, getTodayMeals, getTodayWater, getTodayWaterLogs, deleteWaterLog, getWeeklySummary, getPersonalBest, getLeaderboard, subscribeTodayWorkoutCount, markFlameIgnited, getProgressPhotos, resolveProgram, type WeeklySummary, type PersonalBest } from '@/lib/firestore';
import type { ProgressPhoto, Program } from '@/types';
import { logWaterAction } from '@/lib/actions';
import { getMockProgram, stripWeekdayPrefix, getProgramDayForDow, getNextSession } from '@/lib/programs';
import { useRouter } from 'next/navigation';
import { getGreeting } from '@/lib/utils';
import { getLevelTier } from '@/lib/xp';
import { Card } from '@/components/ui/Card';
import { FastingWidget } from '@/components/dashboard/FastingWidget';
import { DaysWithoutWidget } from '@/components/dashboard/DaysWithoutWidget';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProgressBar } from '@/components/ui/ProgressBar';
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
  const [myRank, setMyRank] = useState<number | null>(null);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [resolvedProgram, setResolvedProgram] = useState<Program | null>(null);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [adjustingWater, setAdjustingWater] = useState(false);
  const [activeGoalCount, setActiveGoalCount] = useState(0);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [todayWorkoutCount, setTodayWorkoutCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    getClientGoals(user.uid)
      .then((goals) => setActiveGoalCount(goals.filter((g) => g.status === 'active').length))
      .catch(() => {});
    getProgressPhotos(user.uid).then(setProgressPhotos).catch(() => {});
  }, [user]);

  // Sync calories + water from profile.statsCache whenever it updates (real-time via AuthContext)
  useEffect(() => {
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

    // Direct queries on mount for goals and initial nutrition totals
    Promise.all([
      getTodayMeals(user.uid, localDateStr),
      getTodayWater(user.uid, localDateStr),
      getUserGoals(user.uid),
    ])
      .then(([meals, water, g]) => {
        const cal = (meals as Array<{ calories?: number }>).reduce((s, m) => s + (m.calories ?? 0), 0);
        setCalories(cal);
        setWaterMl(water as number);
        setGoals({ calories: g.calories, water: g.water });
      })
      .catch((err) => console.error('[Dashboard] Data load error:', err))
      .finally(() => setLoading(false));

    // Real-time listeners — update immediately on any new write
    const unsubCal = subscribeTodayCalories(user.uid, localDateStr, setCalories);
    const unsubWater = subscribeTodayWater(user.uid, localDateStr, setWaterMl);

    return () => {
      unsubCal();
      unsubWater();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getLeaderboard(200).then((entries) => {
      const myIdx = entries.findIndex((e) => e.id === user.uid);
      setMyRank(myIdx === -1 ? null : myIdx + 1);
    }).catch(() => {});
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
  // getNextSession is the single shared answer to "what's next" — it skips
  // stale rest slots (deadlock fix) and only reports isRestToday when the
  // user actually trained yesterday, so a rest day is shown for exactly one
  // real day instead of trapping the pointer forever.
  const nextSession = programSource && !workedOutToday
    ? getNextSession(programSource, lastCompleted, profile?.statsCache?.lastWorkoutDate)
    : null;
  // nextAbsIdx: absolute slot index the user should do next (or just did today)
  const nextAbsIdx = workedOutToday ? lastCompleted : (nextSession?.index ?? lastCompleted + 1);
  const todayDay = workedOutToday
    ? (programSource ? getProgramDayForDow(programSource, lastCompleted) : null)
    : (nextSession?.day ?? null);
  const isRestToday = !workedOutToday && (nextSession?.isRestToday ?? false);
  // After today's session is done, preview what's next — fills the card
  // (which spans 3 grid rows) instead of leaving a dead gap under the
  // congrats message, and answers the natural next question anyway.
  const upcomingSession = programSource && workedOutToday
    ? getNextSession(programSource, lastCompleted, profile?.statsCache?.lastWorkoutDate)
    : null;
  const upcomingDay = upcomingSession?.day ?? null;
  const programPct = activeProgram
    ? Math.min(100, Math.round((completedWorkouts / activeProgram.totalWorkouts) * 100))
    : 0;

  const firstExerciseName = !isRestToday ? todayDay?.exercises?.[0]?.name : undefined;

  useEffect(() => {
    if (!user) return;
    getWeeklySummary(user.uid).then(setWeeklySummary).catch(() => {});
  }, [user]);

  // Ambient social-proof ticker — live, not a one-time fetch, so it feels
  // like a real active community rather than a stale number.
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeTodayWorkoutCount(setTodayWorkoutCount);
    return () => unsub();
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

  return (
    <div>
      <Header />
      <div className="px-4 py-4 space-y-5">
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
        <motion.div {...stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <p className="text-text-secondary text-sm">{greeting},</p>
          <h1 className="text-2xl font-black text-white tracking-tight">{firstName} 💪</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {activeProgram && (
              <Badge variant="accent" className="max-w-[240px]">
                <span className="truncate block">
                  Day {workedOutToday ? Math.max(1, completedWorkouts) : completedWorkouts + 1} of {activeProgram.programName}
                </span>
              </Badge>
            )}
            {streak > 0 && <Badge variant="muted">🔥 {streak} day streak</Badge>}
            <Badge variant="muted">
              <span className={tier.color}>⚡</span> Lvl {powerLevel} · {tier.title}
            </Badge>
          </div>
          {todayWorkoutCount !== null && todayWorkoutCount >= 3 && (
            <p className="text-xs text-accent mt-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {todayWorkoutCount} people have trained today
            </p>
          )}
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
              ) : FLAME_COPY[flameState] && (
                <p className="text-[9px] text-center text-amber-400/80 font-medium mb-1.5 relative">
                  {FLAME_COPY[flameState]}
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
              <Card className="p-5 h-full relative overflow-hidden flex flex-col card-float">
                <div className="absolute right-0 bottom-0 opacity-[0.04] pointer-events-none">
                  <Dumbbell className="w-28 h-28 text-accent" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {workedOutToday && completedWorkouts > 0 ? (
                      <Badge variant="success">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Day {Math.max(1, completedWorkouts)} Complete
                      </Badge>
                    ) : (
                      <Badge variant="accent">
                        Day {completedWorkouts + 1} of {activeProgram.totalWorkouts}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white">{activeProgram.programName}</h3>
                  {workedOutToday && completedWorkouts > 0 ? (
                    <p className="text-sm text-success mt-0.5">
                      🎉 Great work! Come back tomorrow for Day {completedWorkouts + 1}.
                      {activeProgram.totalWorkouts - completedWorkouts > 0 &&
                        ` ${activeProgram.totalWorkouts - completedWorkouts} session${activeProgram.totalWorkouts - completedWorkouts !== 1 ? 's' : ''} remaining.`
                      }
                    </p>
                  ) : todayDay ? (
                    <p className="text-sm text-text-secondary mt-0.5">
                      {isRestToday ? '😴 Rest Day — recover well' : `Today: ${stripWeekdayPrefix(todayDay.label)}`}
                    </p>
                  ) : null}
                  {/* Full session preview — the card spans 3 grid rows, so a
                      single "Target:" line left a large dead gap between the
                      header and the progress bar. Listing every exercise for
                      today fills that space with the thing the user actually
                      opens this card to know: what's in the session. */}
                  {!workedOutToday && !isRestToday && (todayDay?.exercises?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {todayDay!.exercises.slice(0, 4).map((ex) => (
                        <div key={ex.id} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-text-secondary min-w-0">
                            <Dumbbell className="w-3 h-3 text-text-tertiary flex-shrink-0" />
                            <span className="truncate">{ex.name}</span>
                          </span>
                          <span className="text-text-tertiary flex-shrink-0 ml-2">{ex.sets}×{ex.reps}</span>
                        </div>
                      ))}
                      {/* The card is a fixed-height grid cell with
                          overflow-hidden — an uncapped list on a 7-exercise
                          day would clip against the border exactly like the
                          button row used to. */}
                      {todayDay!.exercises.length > 4 && (
                        <p className="text-[11px] text-text-tertiary">+{todayDay!.exercises.length - 4} more in session</p>
                      )}
                    </div>
                  )}
                  {/* Same idea for the day-complete state: the congrats line
                      alone left the tall card mostly empty, so preview what
                      tomorrow holds in that space instead. */}
                  {workedOutToday && completedWorkouts > 0 && upcomingDay && (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold text-text-tertiary uppercase tracking-wide mb-1.5">
                        Next workout: {upcomingDay.isRest ? 'Rest Day' : stripWeekdayPrefix(upcomingDay.label)}
                      </p>
                      {upcomingDay.isRest ? (
                        <p className="text-xs text-text-secondary flex items-center gap-1.5"><Moon className="w-3 h-3" /> Recovery — let your muscles grow.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {upcomingDay.exercises.slice(0, 4).map((ex) => (
                            <div key={ex.id} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5 text-text-secondary min-w-0">
                                <Dumbbell className="w-3 h-3 text-text-tertiary flex-shrink-0" />
                                <span className="truncate">{ex.name}</span>
                              </span>
                              <span className="text-text-tertiary flex-shrink-0 ml-2">{ex.sets}×{ex.reps}</span>
                            </div>
                          ))}
                          {upcomingDay.exercises.length > 4 && (
                            <p className="text-[11px] text-text-tertiary">+{upcomingDay.exercises.length - 4} more in session</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {!workedOutToday && !isRestToday && personalBest && (
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
                      {programPct}% complete · {activeProgram.totalWorkouts - completedWorkouts} sessions remaining
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {isRestToday ? (
                      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <Moon className="w-3.5 h-3.5" /> Rest day
                      </div>
                    ) : workedOutToday && completedWorkouts > 0 ? (
                      <Button size="sm" variant="ghost" onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${nextAbsIdx}`)}>
                        <RotateCcw className="w-3.5 h-3.5" /> Repeat Today
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${nextAbsIdx}`)}>
                        <Play className="w-4 h-4" /> Start Workout
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => router.push(`/training/${activeProgram.programId}`)}>
                      View <ChevronRight className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => router.push('/training')}>
                      <RefreshCw className="w-3 h-3" /> Switch
                    </Button>
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

        <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-4 auto-rows-[86px] gap-3">

          {/* Rank */}
          <motion.div variants={stagger.item} className="col-span-2 row-span-1">
            <Link href="/community?tab=leaderboard" className="block h-full">
              <Card className="p-3.5 h-full flex flex-col items-center justify-center text-center hover:border-accent/30 transition-colors card-float">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Leaderboard</span>
                <p className="text-xl font-black text-accent leading-tight mt-0.5">{myRank ? `#${myRank}` : '—'}</p>
                <p className="text-[10px] text-text-tertiary mt-0.5">Lvl {powerLevel} · {profile?.xp ?? 0} XP</p>
              </Card>
            </Link>
          </motion.div>

          {/* PR Wall teaser */}
          <motion.div variants={stagger.item} className="col-span-2 row-span-1">
            <Link href="/community/prs" className="block h-full">
              <Card className="p-3.5 h-full flex flex-col items-center justify-center text-center hover:border-accent/30 transition-colors card-float">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">PR Wall</span>
                <span className="text-lg mt-0.5">🏅</span>
                <p className="text-[10px] text-text-tertiary mt-0.5">Post a lift, get verified</p>
              </Card>
            </Link>
          </motion.div>

          {/* Breathing / meditation widget */}
          <motion.div variants={stagger.item} className="col-span-4 row-span-1">
            <Link href="/breathing" className="block h-full">
              <Card className="p-3.5 h-full flex items-center gap-3.5 hover:border-accent/30 transition-colors relative overflow-hidden card-float">
                <div className="relative w-11 h-11 flex-shrink-0 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [0.6, 1, 0.6], opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute w-11 h-11 rounded-full"
                    style={{ background: 'radial-gradient(circle, #F5A623 0%, rgba(245,166,35,0) 72%)' }}
                  />
                  <motion.div
                    animate={{ scale: [0.6, 1, 0.6] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-5 h-5 rounded-full bg-accent"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Breathing</span>
                  <p className="text-sm font-bold text-white">Reset in 5 or 10 minutes</p>
                  <p className="text-[10px] text-text-tertiary mt-0.5">5 guided techniques to relax and refocus</p>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
              </Card>
            </Link>
          </motion.div>

          {/* Goals — only shown once the coach has actually set one */}
          {activeGoalCount > 0 && (
            <motion.div variants={stagger.item} className="col-span-4 row-span-1">
              <Link href="/goals" className="block h-full">
                <Card className="p-3.5 h-full flex items-center gap-3.5 hover:border-accent/30 transition-colors card-float">
                  <div className="w-11 h-11 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Goals</span>
                    <p className="text-sm font-bold text-white">{activeGoalCount} active {activeGoalCount === 1 ? 'goal' : 'goals'}</p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">Tap to check in on your progress</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                </Card>
              </Link>
            </motion.div>
          )}

          {/* Progress photos — only shown once the user has actually taken one */}
          {progressPhotos.length > 0 && (
            <motion.div variants={stagger.item} className="col-span-4 row-span-1">
              <Link href="/progress" className="block h-full">
                <Card className="p-3.5 h-full flex items-center gap-3.5 hover:border-accent/30 transition-colors card-float">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={progressPhotos[0].photoUrl} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Progress Photos</span>
                    <p className="text-sm font-bold text-white">{progressPhotos.length} photo{progressPhotos.length === 1 ? '' : 's'} tracked</p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">Tap to view your timeline & compare</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                </Card>
              </Link>
            </motion.div>
          )}

          {/* Weekly volume — real numbers only, no invented daily breakdown */}
          {weeklySummary && (weeklySummary.workoutsCompleted > 0 || weeklySummary.volumeKg > 0) && (
            <motion.div variants={stagger.item} className="col-span-4 row-span-1">
              <Card className="p-3.5 h-full flex items-center justify-between relative overflow-hidden card-float">
                <div className="absolute right-0 bottom-0 opacity-[0.04] pointer-events-none">
                  <TrendingUp className="w-20 h-20 text-accent" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-accent-muted">
                    <TrendingUp className="w-4 h-4 text-accent" />
                  </div>
                  <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-wide">This Week</span>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-base font-black text-white leading-none">
                      {weeklySummary.volumeKg.toLocaleString()}<span className="text-xs font-medium text-text-secondary ml-1">{profile?.weightUnit ?? 'kg'}</span>
                    </p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">volume</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-black text-white leading-none">
                      {weeklySummary.workoutsCompleted}{activeMock?.daysPerWeek ? <span className="text-xs font-medium text-text-secondary ml-1">/{activeMock.daysPerWeek}</span> : null}
                    </p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">workouts</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Quick Actions — same tinted-card language as the rest of the bento grid */}
          {[
            { icon: Dumbbell, label: 'Workout', href: '/training', from: 'from-purple-400/20', to: 'to-purple-400/5', border: 'border-purple-400/20', color: 'text-purple-300' },
            { icon: Apple, label: 'Log Food', href: '/nutrition/analyze', from: 'from-green-400/20', to: 'to-green-400/5', border: 'border-green-400/20', color: 'text-green-300' },
            { icon: Camera, label: 'Scan & Go', href: '/training/scan-go', from: 'from-blue-400/20', to: 'to-blue-400/5', border: 'border-blue-400/20', color: 'text-blue-300' },
            { icon: CheckSquare, label: 'Habits', href: '/habits', from: 'from-indigo-400/20', to: 'to-indigo-400/5', border: 'border-indigo-400/20', color: 'text-indigo-300' },
            { icon: Sparkles, label: 'Meal Ideas', href: '/nutrition/meal-planner', from: 'from-orange-400/20', to: 'to-orange-400/5', border: 'border-orange-400/20', color: 'text-orange-300' },
            { icon: TrendingUp, label: 'Progress', href: '/progress', from: 'from-teal-400/20', to: 'to-teal-400/5', border: 'border-teal-400/20', color: 'text-teal-300' },
            { icon: Trophy, label: 'Achievements', href: '/achievements', from: 'from-yellow-400/20', to: 'to-yellow-400/5', border: 'border-yellow-400/20', color: 'text-yellow-300' },
            { icon: Swords, label: 'Quests', href: '/quests', from: 'from-pink-400/20', to: 'to-pink-400/5', border: 'border-pink-400/20', color: 'text-pink-300' },
          ].map((action) => (
            <motion.div key={action.label} variants={stagger.item} className="col-span-1 row-span-1">
              <Link href={action.href} className="block h-full">
                <motion.div
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className={`h-full flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br ${action.from} ${action.to} border ${action.border} card-float`}
                >
                  <action.icon className={`w-5 h-5 ${action.color}`} strokeWidth={2.25} />
                  <span className="text-[9px] font-medium text-text-secondary text-center leading-tight">{action.label}</span>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Personal Trackers — fasting timer + custom "days without" streaks; kept
            full-width since both have their own multi-step modals (presets, custom
            goals, reset/delete) that a bento tile is too small to host. */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate} className="space-y-3">
          <FastingWidget />
          <DaysWithoutWidget />
        </motion.div>

      </div>
    </div>
  );
}
