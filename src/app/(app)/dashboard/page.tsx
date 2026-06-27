'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Droplets, Footprints, Zap, Dumbbell, Apple, Thermometer, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayWater, getTodayMeals, getUserWorkouts, getUserGoals } from '@/lib/firestore';
import { getGreeting } from '@/lib/utils';
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

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [waterMl, setWaterMl] = useState<number | null>(null);
  const [calories, setCalories] = useState<number | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<unknown[]>([]);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getTodayWater(user.uid),
      getTodayMeals(user.uid),
      getUserWorkouts(user.uid, 5),
      getUserGoals(user.uid),
    ]).then(([water, meals, workouts, g]) => {
      setWaterMl(water);
      const cal = (meals as Array<unknown>).reduce((s: number, m) => s + ((m as { calories?: number }).calories || 0), 0);
      setCalories(cal);
      setRecentWorkouts(workouts);
      setGoals({ calories: g.calories, water: g.water });
    }).catch(console.error).finally(() => setLoading(false));
  }, [user]);

  const greeting = getGreeting();
  const firstName = profile?.displayName?.split(' ')[0] || 'Warrior';

  const stats = [
    {
      icon: Flame,
      label: 'Calories',
      value: calories ?? 0,
      unit: 'kcal',
      max: goals.calories,
      color: 'text-orange-400',
      bg: 'bg-orange-400/10',
    },
    {
      icon: Droplets,
      label: 'Water',
      value: waterMl ? Math.round(waterMl / 100) / 10 : 0,
      unit: 'L',
      max: goals.water / 1000,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      icon: Footprints,
      label: 'Steps',
      value: 0,
      unit: '',
      max: 10000,
      color: 'text-green-400',
      bg: 'bg-green-400/10',
    },
    {
      icon: Zap,
      label: 'Streak',
      value: profile?.stats?.streak ?? 0,
      unit: 'd',
      max: 30,
      color: 'text-accent',
      bg: 'bg-accent-muted',
    },
  ];

  const quickActions = [
    { icon: Dumbbell, label: 'Log Workout', href: '/training', color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { icon: Apple, label: 'Log Food', href: '/nutrition', color: 'text-green-400', bg: 'bg-green-400/10' },
    { icon: Droplets, label: 'Log Water', href: '/nutrition', color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { icon: Thermometer, label: 'Ice Bath', href: '/progress', color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  ];

  return (
    <div>
      <Header />
      <div className="px-4 py-4 space-y-5">
        {/* Greeting */}
        <motion.div {...stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <p className="text-text-secondary text-sm">{greeting},</p>
          <h1 className="text-2xl font-black text-white tracking-tight">{firstName} 💪</h1>
          {profile?.stats?.streak ? (
            <Badge variant="accent" className="mt-1">
              🔥 {profile.stats.streak} day streak
            </Badge>
          ) : null}
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          variants={stagger.container}
          initial="initial"
          animate="animate"
          className="grid grid-cols-2 gap-3"
        >
          {stats.map((stat) => (
            <motion.div key={stat.label} variants={stagger.item}>
              <Card className="p-4">
                {loading ? (
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
                      color={stat.label === 'Streak' ? 'accent' : stat.label === 'Calories' ? 'danger' : 'info'}
                      size="sm"
                      className="mt-2"
                    />
                  </>
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <h2 className="text-base font-bold text-white mb-3">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((action) => (
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

        {/* Today's Workout Card */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <h2 className="text-base font-bold text-white mb-3">Today&apos;s Workout</h2>
          <Link href="/training">
            <Card className="p-4 relative overflow-hidden">
              <div className="absolute right-4 top-4 opacity-10">
                <Dumbbell className="w-16 h-16 text-accent" />
              </div>
              <Badge variant="accent" className="mb-2">Ready</Badge>
              <h3 className="text-lg font-bold text-white">Upper Body Strength</h3>
              <p className="text-sm text-text-secondary mt-1">4 exercises · ~45 min</p>
              <div className="mt-4">
                <ProgressBar value={0} max={100} label="Today's progress" showLabel size="sm" />
              </div>
              <Button variant="primary" size="sm" className="mt-4">
                Start Session
              </Button>
            </Card>
          </Link>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <h2 className="text-base font-bold text-white mb-3">Recent Activity</h2>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
          ) : recentWorkouts.length === 0 ? (
            <Card className="p-6 text-center">
              <Dumbbell className="w-10 h-10 text-text-tertiary mx-auto mb-2" />
              <p className="text-text-secondary text-sm">No recent workouts</p>
              <p className="text-text-tertiary text-xs mt-1">Complete your first session!</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {(recentWorkouts as Array<{ id: string; completedAt: unknown; duration?: number; exercises?: unknown[] }>).map((w) => (
                <Card key={w.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent-muted rounded-xl">
                      <Dumbbell className="w-4 h-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Workout Session</p>
                      <p className="text-xs text-text-secondary">{w.duration ? `${w.duration} min` : 'Completed'}</p>
                    </div>
                  </div>
                  <Badge variant="success">Done</Badge>
                </Card>
              ))}
            </div>
          )}
        </motion.div>

        {/* AI Tip */}
        <motion.div variants={stagger.item} initial={stagger.item.initial} animate={stagger.item.animate}>
          <Card glass className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🤖</span>
              <span className="text-xs font-medium text-accent">AI TIP OF THE DAY</span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Progressive overload is the key to muscle growth. Try adding 2.5kg to your main lifts each week,
              or add one extra rep per set. Consistency beats intensity every time.
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
