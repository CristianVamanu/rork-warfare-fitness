'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Award, Dumbbell, Scale, Calendar } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { getUserWorkouts } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

const MOCK_WEIGHT_DATA = [
  { date: 'Jun 1', weight: 85 }, { date: 'Jun 5', weight: 84.5 },
  { date: 'Jun 10', weight: 84 }, { date: 'Jun 15', weight: 83.5 },
  { date: 'Jun 20', weight: 83 }, { date: 'Jun 25', weight: 82.5 },
];

const MOCK_VOLUME_DATA = [
  { date: 'Mon', volume: 4500 }, { date: 'Tue', volume: 0 },
  { date: 'Wed', volume: 5200 }, { date: 'Thu', volume: 3800 },
  { date: 'Fri', volume: 6100 }, { date: 'Sat', volume: 0 },
  { date: 'Sun', volume: 4300 },
];

const PERSONAL_RECORDS = [
  { exercise: 'Bench Press', weight: 120, unit: 'kg', date: 'Jun 15' },
  { exercise: 'Squat', weight: 160, unit: 'kg', date: 'Jun 10' },
  { exercise: 'Deadlift', weight: 200, unit: 'kg', date: 'Jun 20' },
  { exercise: 'OHP', weight: 80, unit: 'kg', date: 'Jun 5' },
];

const ACHIEVEMENTS = [
  { icon: '🔥', title: 'Streak Hunter', desc: '7-day streak', earned: true },
  { icon: '💪', title: 'Iron Will', desc: '50 workouts', earned: true },
  { icon: '🏆', title: 'PR Machine', desc: '10 personal records', earned: false },
  { icon: '🎯', title: 'Century Club', desc: '100 workouts', earned: false },
  { icon: '⚡', title: 'Power Level 9000', desc: 'Reach power level 100', earned: false },
  { icon: '🌊', title: 'Hydration King', desc: '3L water for 7 days', earned: false },
];

export default function ProgressPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState<unknown[]>([]);

  useEffect(() => {
    if (!user) return;
    getUserWorkouts(user.uid, 30)
      .then(setWorkouts)
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div>
      <Header title="Progress" />
      <div className="px-4 py-4 space-y-5">
        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-3"
        >
          {[
            { icon: Dumbbell, label: 'Total Workouts', value: profile?.statsCache?.totalWorkouts ?? profile?.stats?.totalWorkouts ?? workouts.length, color: 'text-purple-400', bg: 'bg-purple-400/10' },
            { icon: TrendingUp, label: 'Current Streak', value: `${profile?.statsCache?.streak ?? profile?.stats?.streak ?? 0}d`, color: 'text-accent', bg: 'bg-accent-muted' },
            { icon: Scale, label: 'Weight Lost', value: '2.5kg', color: 'text-green-400', bg: 'bg-green-400/10' },
            { icon: Award, label: 'Achievements', value: `${ACHIEVEMENTS.filter(a => a.earned).length}/${ACHIEVEMENTS.length}`, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <Card key={label} className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${bg} mb-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-xl font-black text-white">{value}</p>
              <p className="text-xs text-text-secondary mt-0.5">{label}</p>
            </Card>
          ))}
        </motion.div>

        {/* Weight Chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-base font-bold text-white mb-3">Weight Trend</h2>
          <Card className="p-4">
            <p className="text-xs text-text-secondary mb-3">Last 30 days · kg</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={MOCK_WEIGHT_DATA}>
                <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
                <Tooltip
                  contentStyle={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="weight" stroke="#F5A623" strokeWidth={2} dot={{ fill: '#F5A623', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Volume Chart */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="text-base font-bold text-white mb-3">Weekly Volume</h2>
          <Card className="p-4">
            <p className="text-xs text-text-secondary mb-3">Total kg lifted this week</p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={MOCK_VOLUME_DATA}>
                <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="volume" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Personal Records */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-base font-bold text-white mb-3">Personal Records</h2>
          <div className="space-y-2">
            {PERSONAL_RECORDS.map((pr) => (
              <Card key={pr.exercise} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent-muted rounded-xl">
                    <Dumbbell className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{pr.exercise}</p>
                    <p className="text-xs text-text-secondary">{pr.date}</p>
                  </div>
                </div>
                <Badge variant="accent">{pr.weight}{pr.unit}</Badge>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* Achievements */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <h2 className="text-base font-bold text-white mb-3">Achievements</h2>
          <div className="grid grid-cols-2 gap-3">
            {ACHIEVEMENTS.map((a) => (
              <Card key={a.title} className={`p-4 ${!a.earned && 'opacity-40'}`}>
                <div className="text-2xl mb-2">{a.icon}</div>
                <p className="text-sm font-bold text-white">{a.title}</p>
                <p className="text-xs text-text-secondary mt-0.5">{a.desc}</p>
                {a.earned && <Badge variant="success" className="mt-2">Earned</Badge>}
              </Card>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
