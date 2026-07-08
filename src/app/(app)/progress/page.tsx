'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import nextDynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { TrendingUp, Award, Dumbbell, Scale, Zap, Plus, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserWorkouts } from '@/lib/firestore';
import { recordWeight } from '@/lib/actions';
import { getLevelTier, xpToNextLevel } from '@/lib/xp';
import { ACHIEVEMENT_DEFS } from '@/lib/achievements';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';

// recharts is a large dependency — load it only when this page actually
// renders a chart, instead of bundling it into every visit to /progress
// (it was the single heaviest chunk in the app, ~104kB, entirely from this
// one bar chart).
const WeeklyActivityChart = nextDynamic(() => import('@/components/progress/WeeklyActivityChart'), {
  ssr: false,
  loading: () => <div className="h-[120px]" />,
});

interface WorkoutEntry {
  id: string;
  completedAt: unknown;
  duration?: number;
  exercises?: unknown[];
}

export default function ProgressPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [weightModal, setWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  const powerLevel = profile?.powerLevel ?? 0;
  const totalXP = profile?.xp ?? 0;
  const tier = getLevelTier(powerLevel);
  const { current: xpInLevel, needed: xpPerLevel } = xpToNextLevel(totalXP);
  const earnedAchievements = new Set(profile?.achievements ?? []);
  const totalWorkouts = profile?.statsCache?.totalWorkouts ?? profile?.stats?.totalWorkouts ?? workouts.length;
  const streak = profile?.statsCache?.streak ?? profile?.stats?.streak ?? 0;

  useEffect(() => {
    if (!user) return;
    getUserWorkouts(user.uid, 30)
      .then((w) => setWorkouts(w as WorkoutEntry[]))
      .finally(() => setLoading(false));
  }, [user]);

  // Build weekly volume chart from real workouts
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const volumeByDay: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  workouts.slice(0, 7).forEach((w) => {
    const ts = w.completedAt as { toDate?: () => Date } | null;
    const date = ts?.toDate?.();
    if (date) {
      const key = DOW[date.getDay()];
      volumeByDay[key] = (volumeByDay[key] ?? 0) + (w.duration ?? 30);
    }
  });
  const volumeData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => ({
    date: d,
    minutes: volumeByDay[d] ?? 0,
  }));

  const handleLogWeight = async () => {
    if (!user || !weightInput) return;
    const kg = parseFloat(weightInput);
    if (isNaN(kg) || kg < 20 || kg > 400) {
      toast.error('Enter a valid weight');
      return;
    }
    setSavingWeight(true);
    try {
      await recordWeight(user.uid, kg);
      await refreshProfile();
      setWeightModal(false);
      setWeightInput('');
      toast.success('Weight logged!');
    } catch {
      toast.error('Failed to save weight');
    } finally {
      setSavingWeight(false);
    }
  };

  return (
    <div>
      <Header title="Progress" />
      <div className="px-4 py-4 space-y-5">

        {/* Power Level Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 bg-gradient-to-br from-surface to-surface-elevated border-accent/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-text-secondary uppercase tracking-wider mb-0.5">Fitness Level</p>
                <p className={`text-4xl font-black ${tier.color}`}>{powerLevel}</p>
                <p className={`text-sm font-bold ${tier.color} mt-0.5`}>{tier.title}</p>
              </div>
              <div className="p-4 bg-accent-muted rounded-2xl">
                <Zap className="w-8 h-8 text-accent" />
              </div>
            </div>
            <div className="mt-1">
              <div className="flex justify-between text-xs text-text-secondary mb-1.5">
                <span>{xpInLevel} XP</span>
                <span>{xpPerLevel} XP to next level</span>
              </div>
              <ProgressBar value={xpInLevel} max={xpPerLevel} color="accent" size="sm" />
            </div>
            <p className="text-xs text-text-tertiary mt-2">{totalXP} total XP earned</p>
          </Card>
        </motion.div>

        {/* Stats Grid */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-2 gap-3">
          {[
            { icon: Dumbbell, label: 'Total Workouts', value: totalWorkouts,                    color: 'text-purple-400', bg: 'bg-purple-400/10' },
            { icon: TrendingUp, label: 'Day Streak',   value: `${streak}d`,                    color: 'text-accent',    bg: 'bg-accent-muted'  },
            { icon: Scale,      label: 'Current Weight', value: profile?.currentWeightKg ? `${profile.currentWeightKg}kg` : '—', color: 'text-green-400',  bg: 'bg-green-400/10'  },
            { icon: Award,      label: 'Achievements', value: `${earnedAchievements.size}/${ACHIEVEMENT_DEFS.length}`, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <Card key={label} className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${bg} mb-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-xl font-black text-white">{loading && label === 'Total Workouts' ? '…' : value}</p>
              <p className="text-xs text-text-secondary mt-0.5">{label}</p>
            </Card>
          ))}
        </motion.div>

        {/* Weight Tracker */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">Body Weight</h2>
            <Button size="sm" variant="ghost" onClick={() => setWeightModal(true)}>
              <Plus className="w-3.5 h-3.5" /> Log Weight
            </Button>
          </div>
          <Card className="p-4">
            {profile?.currentWeightKg ? (
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-green-400/10 rounded-xl">
                  <Scale className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-black text-white">{profile.currentWeightKg} <span className="text-sm text-text-secondary">kg</span></p>
                  <p className="text-xs text-text-tertiary">Last logged weight</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <Scale className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                <p className="text-text-secondary text-sm">No weight logged yet</p>
                <Button size="sm" className="mt-3" onClick={() => setWeightModal(true)}>Log First Weigh-In</Button>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Weekly Activity Chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-base font-bold text-white mb-3">Weekly Activity</h2>
          <Card className="p-4">
            <p className="text-xs text-text-secondary mb-3">Minutes trained per day (last 7 workouts)</p>
            {loading ? (
              <Skeleton className="h-28 rounded-xl" />
            ) : (
              <WeeklyActivityChart data={volumeData} />
            )}
          </Card>
        </motion.div>

        {/* Achievements */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">Achievements</h2>
            <Badge variant="accent">{earnedAchievements.size}/{ACHIEVEMENT_DEFS.length}</Badge>
          </div>

          {/* Category grouping */}
          {(['workouts', 'streak', 'power', 'time', 'nutrition'] as const).map((cat) => {
            const catDefs = ACHIEVEMENT_DEFS.filter((d) => d.category === cat);
            const catLabels: Record<string, string> = {
              workouts: '💪 Workouts', streak: '🔥 Streaks', power: '⚡ Fitness Level',
              time: '🕐 Timing', nutrition: '🥗 Nutrition',
            };
            return (
              <div key={cat} className="mb-4">
                <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">{catLabels[cat]}</p>
                <div className="grid grid-cols-2 gap-2">
                  {catDefs.map((a) => {
                    const earned = earnedAchievements.has(a.id);
                    return (
                      <Card key={a.id} className={`p-3.5 transition-all ${earned ? 'border-yellow-400/30' : 'opacity-35'}`}>
                        <div className="text-2xl mb-1.5">{a.icon}</div>
                        <p className="text-sm font-bold text-white leading-tight">{a.title}</p>
                        <p className="text-xs text-text-secondary mt-0.5">{a.desc}</p>
                        {earned && <Badge variant="success" className="mt-2 text-[10px]">Earned ✓</Badge>}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Recent Workouts Summary */}
        {!loading && workouts.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h2 className="text-base font-bold text-white mb-3">Recent Sessions</h2>
            <div className="space-y-2">
              {workouts.slice(0, 5).map((w) => {
                const ts = w.completedAt as { toDate?: () => Date } | null;
                const date = ts?.toDate?.();
                const dateStr = date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                return (
                  <Card key={w.id} className="p-3 flex items-center gap-3">
                    <div className="p-2 bg-accent-muted rounded-xl flex-shrink-0">
                      <Dumbbell className="w-4 h-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">
                        {w.duration ? `${w.duration} min session` : 'Workout Session'}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {Array.isArray(w.exercises) ? `${w.exercises.length} exercises` : 'Completed'}
                        {dateStr && ` · ${dateStr}`}
                      </p>
                    </div>
                    <Target className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                  </Card>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      {/* Log Weight Modal */}
      <Modal open={weightModal} onClose={() => setWeightModal(false)} title="Log Body Weight">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-secondary mb-2 block">Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              min="20"
              max="400"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="e.g. 82.5"
              className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-accent/50"
              autoFocus
            />
          </div>
          <Button fullWidth loading={savingWeight} onClick={handleLogWeight}>
            Save Weight
          </Button>
        </div>
      </Modal>
    </div>
  );
}
