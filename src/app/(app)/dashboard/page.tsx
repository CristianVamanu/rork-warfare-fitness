'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Droplets, Dumbbell, Apple, Droplets as WaterIcon, ChevronRight, Play, Moon, RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, Trophy, CheckSquare, Swords, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserGoals, subscribeTodayCalories, subscribeTodayWater, getTodayMeals, getTodayWater, getWeeklySummary, getPersonalBest, getLeaderboard, type WeeklySummary, type PersonalBest, type LeaderboardEntry } from '@/lib/firestore';
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
  const streak = profile?.statsCache?.streak ?? profile?.stats?.streak ?? 0;
  const powerLevel = profile?.powerLevel ?? 0;
  const tier = getLevelTier(powerLevel);

  // Streak urgency: streak > 0 but user hasn't worked out today yet
  const localDateStr = new Date().toLocaleDateString('sv-SE');
  const workedOutToday = profile?.statsCache?.lastWorkoutDate === localDateStr;
  const streakAtRisk = !loading && streak > 0 && !workedOutToday;

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
                {streak > 0 && (
                  <>
                    <div
                      className="flame-glow absolute w-32 h-32 rounded-full pointer-events-none"
                      style={{ background: 'radial-gradient(circle, rgba(245,166,35,0.55) 0%, rgba(245,166,35,0) 70%)' }}
                    />
                    <span className="flame-flicker absolute text-[104px] leading-none opacity-25 pointer-events-none select-none">
                      🔥
                    </span>
                  </>
                )}
                <p className="text-4xl font-black text-white leading-none relative drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                  {streak}<span className="text-lg font-bold text-text-secondary ml-0.5">d</span>
                </p>
              </div>

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
                  <div className="flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Water</span>
                  </div>
                  <p className="text-lg font-black text-white">
                    {waterMl ? Math.round(waterMl / 100) / 10 : 0}<span className="text-xs font-medium text-text-secondary ml-1">/{goals.water / 1000}L</span>
                  </p>
                  <ProgressBar value={waterMl ?? 0} max={goals.water} color="info" size="sm" />
                </>
              )}
            </Card>
          </motion.div>

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
            { icon: CheckSquare, label: 'Habits', href: '/habits', from: 'from-accent/20', to: 'to-accent/5', border: 'border-accent/20', color: 'text-accent' },
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
