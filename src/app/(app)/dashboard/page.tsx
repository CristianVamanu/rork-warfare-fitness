'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Flame, Droplets, Dumbbell, Apple, Droplets as WaterIcon, ChevronRight, Play, Moon, RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, Trophy, CheckSquare, Swords, Sparkles, Plus, Minus, Activity } from 'lucide-react';
import { getIdToken } from 'firebase/auth';
import { recoveryColorClass } from '@/lib/whoopUi';
import { useAuth } from '@/contexts/AuthContext';
import { getUserGoals, subscribeTodayCalories, subscribeTodayWater, getTodayMeals, getTodayWater, getTodayWaterLogs, deleteWaterLog, getWeeklySummary, getPersonalBest, getLeaderboard, markFlameIgnited, type WeeklySummary, type PersonalBest, type LeaderboardEntry } from '@/lib/firestore';
import { logWaterAction } from '@/lib/actions';
import { getMockProgram, stripWeekdayPrefix } from '@/lib/programs';
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
import { QuestBadgeRow } from '@/components/ui/QuestBadgeRow';
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
  const [leaderboardTop, setLeaderboardTop] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [adjustingWater, setAdjustingWater] = useState(false);
  const [whoop, setWhoop] = useState<{ recoveryScore?: number; sleepPerformancePercent?: number; dayStrain?: number; restingHeartRate?: number } | null>(null);

  // WHOOP recovery/sleep/strain — only fetched (and shown) if the user has
  // connected a wearable and hasn't hidden it from Settings.
  useEffect(() => {
    const dashboardVisible = profile?.whoopDashboardVisible;
    if (!user || dashboardVisible === false) { setWhoop(null); return; }
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/whoop/status', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (data.connected && data.summary) setWhoop(data.summary);
      } catch { /* ignore — optional widget */ }
    })();
  }, [user, profile]);

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
      setLeaderboardTop(entries.slice(0, 3));
      const myIdx = entries.findIndex((e) => e.id === user.uid);
      setMyRank(myIdx === -1 ? null : myIdx + 1);
    }).catch(() => {});
  }, [user]);

  const greeting = getGreeting();
  const firstName = profile?.displayName?.split(' ')[0] || 'Athlete';
  const powerLevel = profile?.powerLevel ?? 0;
  const tier = getLevelTier(powerLevel);

  const localDateStr = new Date().toLocaleDateString('sv-SE');
  const workedOutToday = profile?.statsCache?.lastWorkoutDate === localDateStr;

  // `stats.streak` is only recomputed when a workout is completed (see
  // completeWorkout() in actions.ts) — there's no daily job that decays it,
  // so it stays stuck at its last value for however many days the user
  // stays away, showing a stale "lit" streak long after it's actually
  // broken. Derive the *real* state here from the day-gap instead of
  // trusting the cached number on its own: 0 days = trained today, 1 day =
  // still salvageable today (the one grace day), 2+ days = the streak is
  // dead until a fresh workout starts a new one.
  const lastWorkoutDateStr = profile?.statsCache?.lastWorkoutDate as string | undefined;
  const daysSinceLastWorkout = lastWorkoutDateStr
    ? Math.round((new Date(localDateStr + 'T00:00:00').getTime() - new Date(lastWorkoutDateStr + 'T00:00:00').getTime()) / 86_400_000)
    : null;
  const streakBroken = daysSinceLastWorkout !== null && daysSinceLastWorkout >= 2;
  const streak = streakBroken ? 0 : (profile?.statsCache?.streak ?? profile?.stats?.streak ?? 0);
  const streakAtRisk = !loading && streak > 0 && !workedOutToday;

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
    flickering: 'Flickering — train today to keep it lit',
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
  // nextAbsIdx: absolute day index the user should do next (or just did today)
  const nextAbsIdx = workedOutToday ? lastCompleted : lastCompleted + 1;
  const activeMock = activeProgram ? getMockProgram(activeProgram.programId) : null;
  const scheduleLen = activeMock?.schedule?.length || 7;
  const todayScheduleIdx = nextAbsIdx % scheduleLen;
  const todayDay = activeMock?.schedule?.[todayScheduleIdx] ?? null;
  const programPct = activeProgram
    ? Math.min(100, Math.round((completedWorkouts / activeProgram.totalWorkouts) * 100))
    : 0;

  const firstExerciseName = !todayDay?.isRest ? todayDay?.exercises?.[0]?.name : undefined;

  useEffect(() => {
    if (!user) return;
    getWeeklySummary(user.uid).then(setWeeklySummary).catch(() => {});
  }, [user]);

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
              <Badge variant="accent">
                Day {workedOutToday ? lastCompleted + 1 : lastCompleted + 2} of {activeProgram.programName}
              </Badge>
            )}
            {streak > 0 && <Badge variant="muted">🔥 {streak} day streak</Badge>}
            <Badge variant="muted">
              <span className={tier.color}>⚡</span> Lvl {powerLevel} · {tier.title}
            </Badge>
          </div>
        </motion.div>

        {/* Bento Grid — the glanceable stuff, sized by how much it matters */}
        <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-4 auto-rows-[86px] gap-3">

          {/* Streak — hero tile, flame centered behind the number */}
          <motion.div variants={stagger.item} className="col-span-2 row-span-2">
            <Card className="p-4 h-full flex flex-col bg-gradient-to-br from-surface-elevated to-surface relative overflow-hidden">
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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleRemoveWater}
                        disabled={adjustingWater || !waterMl}
                        aria-label="Remove 250ml"
                        className="w-5 h-5 rounded-full bg-blue-400/10 text-blue-400 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleAddWater}
                        disabled={adjustingWater}
                        aria-label="Add 250ml"
                        className="w-5 h-5 rounded-full bg-blue-400/10 text-blue-400 flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
                      >
                        <Plus className="w-3 h-3" />
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

          {/* WHOOP recovery/sleep/strain — only shown once connected in Settings */}
          {whoop && (
            <motion.div variants={stagger.item} className="col-span-4 row-span-1">
              <Card className="p-3.5 h-full">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Activity className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">WHOOP</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {whoop.recoveryScore !== undefined && (
                    <div className="text-center">
                      <p className={`text-lg font-black ${recoveryColorClass(whoop.recoveryScore)}`}>{whoop.recoveryScore}%</p>
                      <p className="text-[10px] text-text-tertiary">Recovery</p>
                    </div>
                  )}
                  {whoop.sleepPerformancePercent !== undefined && (
                    <div className="text-center">
                      <p className="text-lg font-black text-blue-400">{whoop.sleepPerformancePercent}%</p>
                      <p className="text-[10px] text-text-tertiary">Sleep</p>
                    </div>
                  )}
                  {whoop.dayStrain !== undefined && (
                    <div className="text-center">
                      <p className="text-lg font-black text-accent">{whoop.dayStrain.toFixed(1)}</p>
                      <p className="text-[10px] text-text-tertiary">Strain</p>
                    </div>
                  )}
                  {whoop.restingHeartRate !== undefined && (
                    <div className="text-center">
                      <p className="text-lg font-black text-red-400">{whoop.restingHeartRate}</p>
                      <p className="text-[10px] text-text-tertiary">RHR</p>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}

  {/* Today's Workout — hero */}
          <motion.div variants={stagger.item} className="col-span-4 row-span-2">
            {activeProgram ? (
              <Card className={`p-4 h-full relative overflow-hidden flex flex-col justify-between ${workedOutToday ? 'border-success/30' : 'border-accent/25'}`}>
                <div className="absolute right-0 bottom-0 opacity-[0.04] pointer-events-none">
                  <Dumbbell className="w-28 h-28 text-accent" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {workedOutToday && completedWorkouts > 0 ? (
                      <Badge variant="success">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Day {lastCompleted + 1} Complete
                      </Badge>
                    ) : (
                      <Badge variant="accent">
                        Day {lastCompleted + 2} of {activeProgram.totalWorkouts}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white">{activeProgram.programName}</h3>
                  {workedOutToday && completedWorkouts > 0 ? (
                    <p className="text-sm text-success mt-0.5">
                      🎉 Great work! Come back tomorrow for Day {lastCompleted + 2}.
                      {activeProgram.totalWorkouts - completedWorkouts > 0 &&
                        ` ${activeProgram.totalWorkouts - completedWorkouts} session${activeProgram.totalWorkouts - completedWorkouts !== 1 ? 's' : ''} remaining.`
                      }
                    </p>
                  ) : todayDay ? (
                    <p className="text-sm text-text-secondary mt-0.5">
                      {todayDay.isRest ? '😴 Rest Day — recover well' : `Today: ${stripWeekdayPrefix(todayDay.label)}`}
                    </p>
                  ) : null}
                  {!workedOutToday && !todayDay?.isRest && firstExerciseName && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-text-tertiary">
                      <Dumbbell className="w-3 h-3" />
                      Target: {firstExerciseName}
                      {todayDay?.exercises?.[0] && (
                        <span> — {todayDay.exercises[0].sets}×{todayDay.exercises[0].reps}</span>
                      )}
                    </div>
                  )}
                  {!workedOutToday && !todayDay?.isRest && personalBest && (
                    <div className="mt-2 flex items-center gap-1.5 p-2 bg-accent/5 border border-accent/20 rounded-lg">
                      <Trophy className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                      <p className="text-xs text-accent">
                        Your best: {personalBest.weight}{profile?.weightUnit ?? 'kg'} × {personalBest.reps}. Beat it today.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-3">
                    <ProgressBar value={completedWorkouts} max={activeProgram.totalWorkouts} color={workedOutToday ? 'success' : 'accent'} size="sm" />
                    <p className="text-xs text-text-tertiary mt-1">
                      {programPct}% complete · {activeProgram.totalWorkouts - completedWorkouts} sessions remaining
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {todayDay?.isRest ? (
                      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <Moon className="w-3.5 h-3.5" /> Rest day
                      </div>
                    ) : workedOutToday && completedWorkouts > 0 ? (
                      <Button size="sm" variant="ghost" onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${nextAbsIdx}`)}>
                        <RefreshCw className="w-3.5 h-3.5" /> Repeat Day
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
                <Card className="p-4 h-full relative overflow-hidden hover:border-accent/20 transition-colors flex flex-col justify-center">
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

          {/* Rank */}
          <motion.div variants={stagger.item} className="col-span-2 row-span-1">
            <Link href="/community?tab=leaderboard" className="block h-full">
              <Card className="p-3.5 h-full flex flex-col items-center justify-center text-center hover:border-accent/30 transition-colors">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Leaderboard</span>
                <p className="text-xl font-black text-accent leading-tight mt-0.5">{myRank ? `#${myRank}` : '—'}</p>
                <p className="text-[10px] text-text-tertiary mt-0.5">Lvl {powerLevel} · {profile?.xp ?? 0} XP</p>
              </Card>
            </Link>
          </motion.div>

          {/* PR Wall teaser */}
          <motion.div variants={stagger.item} className="col-span-2 row-span-1">
            <Link href="/community/prs" className="block h-full">
              <Card className="p-3.5 h-full flex flex-col items-center justify-center text-center hover:border-accent/30 transition-colors">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">PR Wall</span>
                <span className="text-lg mt-0.5">🏅</span>
                <p className="text-[10px] text-text-tertiary mt-0.5">Post a lift, get verified</p>
              </Card>
            </Link>
          </motion.div>

          {/* Weekly volume — real numbers only, no invented daily breakdown */}
          {weeklySummary && (weeklySummary.workoutsCompleted > 0 || weeklySummary.volumeKg > 0) && (
            <motion.div variants={stagger.item} className="col-span-4 row-span-1">
              <Card className="p-3.5 h-full flex items-center justify-between relative overflow-hidden">
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
            { icon: WaterIcon, label: 'Water', href: '/nutrition', from: 'from-blue-400/20', to: 'to-blue-400/5', border: 'border-blue-400/20', color: 'text-blue-300' },
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
                  className={`h-full flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br ${action.from} ${action.to} border ${action.border}`}
                >
                  <action.icon className={`w-5 h-5 ${action.color}`} strokeWidth={2.25} />
                  <span className="text-[9px] font-medium text-text-secondary text-center leading-tight">{action.label}</span>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* Leaderboard preview — kept full-width; ranked list doesn't compress into a tile */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">Leaderboard</h2>
            <Link href="/community?tab=leaderboard" className="text-xs text-accent flex items-center gap-0.5">
              Full board <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <Link href="/community?tab=leaderboard">
            <Card className="p-4 relative overflow-hidden hover:border-accent/20 transition-colors">
              <div className="absolute right-0 bottom-0 opacity-[0.04] pointer-events-none">
                <Trophy className="w-28 h-28 text-accent" />
              </div>
              {myRank && (
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/8">
                  <div className="w-9 h-9 rounded-full bg-accent-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-black text-accent">#{myRank}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Your Rank</p>
                    <p className="text-xs text-text-secondary">Out of {leaderboardTop.length > 0 ? 'active athletes' : '—'}</p>
                  </div>
                </div>
              )}
              {leaderboardTop.length === 0 ? (
                <p className="text-text-secondary text-sm text-center py-2">Complete a workout to join the leaderboard</p>
              ) : (
                <div className="space-y-2.5">
                  {leaderboardTop.map((entry, i) => (
                    <div key={entry.id} className="flex items-center gap-3">
                      <span className={`text-sm font-black w-5 flex-shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : 'text-orange-400'}`}>
                        {i + 1}
                      </span>
                      <span className="text-sm text-white flex-1 truncate flex items-center gap-1">
                        {entry.displayName}
                        <QuestBadgeRow questIds={entry.questsCompleted} max={2} />
                      </span>
                      <span className="text-xs text-text-tertiary flex-shrink-0">Lvl {entry.powerLevel} · {entry.xp} XP</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Link>
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
