'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Droplet, Moon, Brain, Wind, Pill, Sun, BookOpen, Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { toggleHabit, getRecentHabitLogs } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { HABIT_KEYS, type HabitKey, type HabitLog } from '@/types';

const HABIT_META: Record<HabitKey, { label: string; icon: React.ElementType; color: string }> = {
  water: { label: 'Water', icon: Droplet, color: 'text-blue-400 bg-blue-400/10' },
  sleep: { label: 'Sleep', icon: Moon, color: 'text-purple-400 bg-purple-400/10' },
  meditation: { label: 'Meditation', icon: Brain, color: 'text-pink-400 bg-pink-400/10' },
  stretching: { label: 'Stretching', icon: Wind, color: 'text-sky-400 bg-sky-400/10' },
  creatine: { label: 'Creatine', icon: Pill, color: 'text-orange-400 bg-orange-400/10' },
  vitaminD: { label: 'Vitamin D', icon: Sun, color: 'text-yellow-400 bg-yellow-400/10' },
  reading: { label: 'Reading', icon: BookOpen, color: 'text-green-400 bg-green-400/10' },
};

const HISTORY_DAYS = 7;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HabitsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [saving, setSaving] = useState<HabitKey | null>(null);
  const today = todayStr();

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const recent = await getRecentHabitLogs(user.uid, HISTORY_DAYS);
      setLogs(recent);
    } catch {
      toast.error('Failed to load habits');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const todayLog = logs.find((l) => l.date === today);

  async function handleToggle(habit: HabitKey) {
    if (!user) return;
    const currentlyDone = !!todayLog?.habits?.[habit];
    setSaving(habit);
    // Optimistic update
    setLogs((prev) => {
      const existing = prev.find((l) => l.date === today);
      if (existing) {
        return prev.map((l) => l.date === today ? { ...l, habits: { ...l.habits, [habit]: !currentlyDone } } : l);
      }
      return [{ id: `${user.uid}_${today}`, userId: user.uid, date: today, habits: { [habit]: !currentlyDone }, updatedAt: null }, ...prev];
    });
    try {
      await toggleHabit(user.uid, today, habit, !currentlyDone);
      if (!currentlyDone) navigator.vibrate?.(10);
    } catch {
      toast.error('Failed to save — try again');
      load();
    } finally {
      setSaving(null);
    }
  }

  // Consecutive-day streak per habit, counting back from today
  function streakFor(habit: HabitKey): number {
    let streak = 0;
    for (let i = 0; i < HISTORY_DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const log = logs.find((l) => l.date === dateStr);
      if (log?.habits?.[habit]) streak++;
      else break;
    }
    return streak;
  }

  const doneToday = HABIT_KEYS.filter((h) => todayLog?.habits?.[h]).length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header title="Habits" />
      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Today&apos;s Progress</p>
            <p className="text-xs text-text-secondary mt-0.5">{doneToday} of {HABIT_KEYS.length} habits done</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-accent-muted flex items-center justify-center">
            <span className="text-sm font-black text-accent">{doneToday}/{HABIT_KEYS.length}</span>
          </div>
        </Card>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        ) : (
          <div className="space-y-2.5">
            {HABIT_KEYS.map((habit, i) => {
              const meta = HABIT_META[habit];
              const done = !!todayLog?.habits?.[habit];
              const streak = streakFor(habit);
              return (
                <motion.button
                  key={habit}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => handleToggle(habit)}
                  disabled={saving === habit}
                  className="w-full text-left"
                >
                  <Card className={`p-4 flex items-center gap-3 transition-colors ${done ? 'border-accent/40 bg-accent/5' : ''}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                      <meta.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{meta.label}</p>
                      {streak > 0 && (
                        <p className="text-xs text-accent">🔥 {streak}-day streak</p>
                      )}
                    </div>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                      done ? 'bg-accent border-accent' : 'border-white/20'
                    }`}>
                      {done && <Check className="w-4 h-4 text-black" />}
                    </div>
                  </Card>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* 7-day history grid */}
        {!loading && (
          <Card className="p-4">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3">Last 7 Days</p>
            <div className="space-y-2">
              {HABIT_KEYS.map((habit) => (
                <div key={habit} className="flex items-center gap-2">
                  <span className="text-[10px] text-text-secondary w-16 flex-shrink-0 truncate">{HABIT_META[habit].label}</span>
                  <div className="flex gap-1 flex-1">
                    {Array.from({ length: HISTORY_DAYS }).map((_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() - (HISTORY_DAYS - 1 - i));
                      const dateStr = d.toISOString().slice(0, 10);
                      const log = logs.find((l) => l.date === dateStr);
                      const done = !!log?.habits?.[habit];
                      return (
                        <div
                          key={i}
                          className={`flex-1 h-4 rounded ${done ? 'bg-accent' : 'bg-surface-elevated'}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
