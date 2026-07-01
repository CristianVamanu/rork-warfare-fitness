'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Droplets, Zap, Dumbbell, Apple, Droplets as WaterIcon, ChevronRight, Play, Moon, RefreshCw, AlertTriangle, Utensils, Timer, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserGoals, subscribeTodayCalories, subscribeTodayWater, getTodayMeals, getTodayWater, subscribeRecentActivity, type ActivityItem } from '@/lib/firestore';
import { getMockProgram, getProgramDayForUser, stripWeekdayPrefix } from '@/lib/programs';
import { useRouter } from 'next/navigation';
import { getGreeting } from '@/lib/utils';
import { getLevelTier } from '@/lib/xp';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/layout/Header';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.06 } } },
  item: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  },
};

const DEFAULT_GOALS = { calories: 2200, water: 3000 };

function getTodayDow(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [waterMl, setWaterMl] = useState<number | null>(null);
  const [calories, setCalories] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [dailyTip, setDailyTip] = useState<string>('');

  // Fetch daily AI fitness tip (changes every day, cached server-side)
  useEffect(() => {
    const today = new Date().toLocaleDateString('sv-SE');
    const cached = sessionStorage.getItem('dailyTip');
    const cachedDate = sessionStorage.getItem('dailyTipDate');
    if (cached && cachedDate === today) {
      setDailyTip(cached);
      return;
    }
    fetch('/api/ai/tip')
      .then(r => r.json())
      .then((d: { tip?: string }) => {
        if (d.tip) {
          setDailyTip(d.tip);
          sessionStorage.setItem('dailyTip', d.tip);
          sessionStorage.setItem('dailyTipDate', today);
        }
      })
      .catch(() => {});
  }, []);

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
    const unsubActivity = subscribeRecentActivity(user.uid, setRecentActivity, 5);

    return () => {
      unsubCal();
      unsubWater();
      unsubActivity();
    };
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

  // Active program data
  const activeProgram = profile?.activeProgram;
  const lastCompleted = activeProgram?.lastCompletedDayIndex !== undefined
    ? activeProgram.lastCompletedDayIndex
    : ((activeProgram?.completedWorkouts ?? 0) > 0 ? (activeProgram?.completedWorkouts ?? 1) - 1 : -1);
  const todayDow = getTodayDow();
  const activeMock = activeProgram ? getMockProgram(activeProgram.programId) : null;
  const todayDay = activeMock
    ? getProgramDayForUser(activeMock, activeProgram?.programStartDate ?? undefined)
    : null;
  const dashboardDayIndex = activeProgram?.programStartDate
    ? Math.floor((Date.now() - new Date(activeProgram.programStartDate).getTime()) / 86400000)
    : todayDow;
  const programPct = activeProgram
    ? Math.min(100, Math.round((activeProgram.completedWorkouts / activeProgram.totalWorkouts) * 100))
    : 0;

  const stats = [
    {
      icon: Flame,
      label: 'Calories',
      value: calories ?? 0,
      unit: 'kcal',
      max: goals.calories,
      color: 'text-orange-400',
      bg: 'bg-orange-400/10',
      barColor: 'danger' as const,
    },
    {
      icon: Droplets,
      label: 'Water',
      value: waterMl ? Math.round(waterMl / 100) / 10 : 0,
      unit: 'L',
      max: goals.water / 1000,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      barColor: 'info' as const,
    },
    {
      icon: Dumbbell,
      label: 'Workouts',
      value: profile?.statsCache?.totalWorkouts ?? profile?.stats?.totalWorkouts ?? 0,
      unit: 'total',
      max: Math.max(profile?.statsCache?.totalWorkouts ?? 1, 1),
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
      barColor: 'info' as const,
    },
    {
      icon: Zap,
      label: 'Streak',
      value: streak,
      unit: 'd',
      max: Math.max(streak, 7),
      color: 'text-accent',
      bg: 'bg-accent-muted',
      barColor: 'accent' as const,
    },
  ];

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
            {streak > 0 && <Badge variant="accent">🔥 {streak} day streak</Badge>}
            <Badge variant="muted">
              <span className={tier.color}>⚡</span> Lvl {powerLevel} · {tier.title}
            </Badge>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={stagger.container} initial="initial" animate="animate" className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <motion.div key={stat.label} variants={stagger.item}>
              <Card className="p-4">
                {loading && calories === null ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-6 w-3/4" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                        <stat.icon className={`w-4 h-4 ${stat.color}`} />
                      </div>
                      <span className="text-xs text-text-secondary">{stat.label}</span>
                    </div>
                    <p className="text-xl font-black text-white">
                      {stat.value}
                      <span className="text-sm font-medium text-text-secondary ml-1">{stat.unit}</span>
                    </p>
                    <ProgressBar
                      value={stat.value}
                      max={stat.max}
                      color={stat.barColor}
                      size="sm"
                      className="mt-2"
                    />
                  </>
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Active Program Card */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <h2 className="text-base font-bold text-white mb-3">Today&apos;s Workout</h2>
          {activeProgram ? (
            <Card className={`p-4 relative overflow-hidden ${workedOutToday ? 'border-success/30' : 'border-accent/20'}`}>
              <div className="absolute right-0 bottom-0 opacity-[0.04] pointer-events-none">
                <Dumbbell className="w-28 h-28 text-accent" />
              </div>

              {/* Badge row */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {workedOutToday && activeProgram.completedWorkouts > 0 ? (
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

              {/* Status line */}
              {workedOutToday && activeProgram.completedWorkouts > 0 ? (
                <p className="text-sm text-success mt-0.5">
                  🎉 Great work! Come back tomorrow for Day {lastCompleted + 2}.
                  {activeProgram.totalWorkouts - activeProgram.completedWorkouts > 0 &&
                    ` ${activeProgram.totalWorkouts - activeProgram.completedWorkouts} session${activeProgram.totalWorkouts - activeProgram.completedWorkouts !== 1 ? 's' : ''} remaining.`
                  }
                </p>
              ) : todayDay ? (
                <p className="text-sm text-text-secondary mt-0.5">
                  {todayDay.isRest ? '😴 Rest Day — recover well' : `Today: ${stripWeekdayPrefix(todayDay.label)}`}
                </p>
              ) : null}

              <div className="mt-3 mb-3">
                <ProgressBar value={activeProgram.completedWorkouts} max={activeProgram.totalWorkouts} color={workedOutToday ? 'success' : 'accent'} size="sm" />
                <p className="text-xs text-text-tertiary mt-1">
                  {programPct}% complete · {activeProgram.totalWorkouts - activeProgram.completedWorkouts} sessions remaining
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                {todayDay?.isRest ? (
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Moon className="w-3.5 h-3.5" /> Rest day
                  </div>
                ) : workedOutToday && activeProgram.completedWorkouts > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${dashboardDayIndex}`)}>
                    <RefreshCw className="w-3.5 h-3.5" /> Repeat Day
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${dashboardDayIndex}`)}>
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
            </Card>
          ) : (
            <Link href="/training">
              <Card className="p-4 relative overflow-hidden hover:border-accent/20 transition-colors">
                <div className="absolute right-0 bottom-0 opacity-[0.04] pointer-events-none">
                  <Dumbbell className="w-28 h-28 text-accent" />
                </div>
                <Badge variant="muted" className="mb-2">No active program</Badge>
                <h3 className="text-base font-bold text-white">Choose a Program</h3>
                <p className="text-sm text-text-secondary mt-1">Pick a training program to get started</p>
                <Button variant="primary" size="sm" className="mt-3">Browse Programs</Button>
              </Card>
            </Link>
          )}
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <h2 className="text-base font-bold text-white mb-3">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Dumbbell, label: 'Workout', href: '/training', color: 'text-purple-400', bg: 'bg-purple-400/10' },
              { icon: Apple, label: 'Log Food', href: '/nutrition/analyze', color: 'text-green-400', bg: 'bg-green-400/10' },
              { icon: WaterIcon, label: 'Water', href: '/nutrition', color: 'text-blue-400', bg: 'bg-blue-400/10' },
            ].map((action) => (
              <Link key={action.label} href={action.href}>
                <motion.div
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className="flex flex-col items-center gap-2 p-3 bg-surface border border-white/8 rounded-2xl"
                >
                  <div className={`p-2.5 rounded-xl ${action.bg}`}>
                    <action.icon className={`w-5 h-5 ${action.color}`} />
                  </div>
                  <span className="text-[10px] text-text-secondary text-center leading-tight">{action.label}</span>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <h2 className="text-base font-bold text-white mb-3">Recent Activity</h2>
          {loading && recentActivity.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
          ) : recentActivity.length === 0 ? (
            <Card className="p-6 text-center">
              <Dumbbell className="w-10 h-10 text-text-tertiary mx-auto mb-2" />
              <p className="text-text-secondary text-sm">No recent activity</p>
              <p className="text-text-tertiary text-xs mt-1">Log a meal, water, or complete a workout!</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((item) => {
                const date = item.createdAt?.toDate?.() ?? null;
                const now = new Date();
                let dateStr = '';
                if (date) {
                  const diffMs = now.getTime() - date.getTime();
                  const diffMins = Math.floor(diffMs / 60000);
                  if (diffMins < 60) dateStr = diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
                  else if (diffMins < 1440) dateStr = `${Math.floor(diffMins / 60)}h ago`;
                  else dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }

                const iconConfig = {
                  WORKOUT_COMPLETED: { icon: Dumbbell, color: 'text-accent', bg: 'bg-accent-muted' },
                  MEAL_LOGGED:       { icon: Utensils, color: 'text-green-400', bg: 'bg-green-400/10' },
                  WATER_LOGGED:      { icon: Droplets, color: 'text-blue-400', bg: 'bg-blue-400/10' },
                  WEIGHT_RECORDED:   { icon: Timer,    color: 'text-purple-400', bg: 'bg-purple-400/10' },
                }[item.type] ?? { icon: Zap, color: 'text-accent', bg: 'bg-accent-muted' };

                const Icon = iconConfig.icon;

                return (
                  <Card key={item.id} className="p-4 flex items-center gap-3">
                    <div className={`p-2 rounded-xl flex-shrink-0 ${iconConfig.bg}`}>
                      <Icon className={`w-4 h-4 ${iconConfig.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.label}</p>
                      {item.sub && (
                        <p className="text-xs text-text-secondary truncate capitalize">{item.sub}</p>
                      )}
                    </div>
                    {dateStr && (
                      <span className="text-xs text-text-tertiary flex-shrink-0">{dateStr}</span>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* AI Tip */}
        {dailyTip && (
          <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
            <Card glass className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🤖</span>
                <span className="text-xs font-medium text-accent">AI TIP OF THE DAY</span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">{dailyTip}</p>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
