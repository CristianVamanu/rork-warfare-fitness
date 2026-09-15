'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Clock, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserWorkouts } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

interface SetLog {
  weight: number;
  reps: number;
  completed: boolean;
  distanceValue?: number;
  distanceUnit?: string;
  elapsedSeconds?: number;
}
interface ExerciseLog { name: string; sets: SetLog[] }

interface WorkoutEntry {
  id: string;
  duration?: number;
  calories?: number;
  totalWeightLifted?: number;
  exercises?: ExerciseLog[];
  completedAt: unknown;
}

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDate(v: unknown): Date | null {
  const ts = v as { toDate?: () => Date } | null;
  return ts?.toDate?.() ?? null;
}

function dateKey(d: Date): string {
  return d.toLocaleDateString('sv-SE'); // YYYY-MM-DD, local
}

function formatSet(s: SetLog): string {
  if (s.distanceValue !== undefined) {
    const mins = Math.floor((s.elapsedSeconds ?? 0) / 60);
    const secs = (s.elapsedSeconds ?? 0) % 60;
    return `${s.distanceValue}${s.distanceUnit ?? ''} · ${mins}:${String(secs).padStart(2, '0')}`;
  }
  return `${s.weight} × ${s.reps}`;
}

export default function WorkoutHistoryPage() {
  const { user, profile } = useAuth();
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  // Only used when a day has more than one logged workout (rare) — picking
  // between them before showing the detail modal. A single-workout day
  // skips straight to the modal instead of making that pick pointless.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [detailWorkout, setDetailWorkout] = useState<WorkoutEntry | null>(null);

  useEffect(() => {
    if (!user) return;
    // Deep enough history for a real calendar view — the dashboard/progress
    // summary only ever needed the last handful of sessions, but "see my
    // full history" implies more than 30.
    getUserWorkouts(user.uid, 300).then((w) => setWorkouts(w as WorkoutEntry[]));
  }, [user]);

  const byDay = useMemo(() => {
    const map = new Map<string, WorkoutEntry[]>();
    workouts.forEach((w) => {
      const d = toDate(w.completedAt);
      if (!d) return;
      const key = dateKey(d);
      map.set(key, [...(map.get(key) ?? []), w]);
    });
    return map;
  }, [workouts]);

  const weightUnit = (profile?.weightUnit as 'kg' | 'lbs') ?? 'kg';

  const calendarCells = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { day: number | null; key: string | null }[] = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null, key: null });
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ day, key: dateKey(new Date(year, month, day)) });
    }
    return cells;
  }, [monthCursor]);

  const monthLabel = monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayKey = dateKey(new Date());
  const selectedWorkouts = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  function openDay(key: string | null) {
    if (!key) return;
    const dayWorkouts = byDay.get(key) ?? [];
    if (dayWorkouts.length === 1) {
      setDetailWorkout(dayWorkouts[0]);
    } else if (dayWorkouts.length > 1) {
      setSelectedDay(key);
    }
  }

  return (
    <div>
      <Header title="Workout History" showBack />
      <div className="px-4 py-4 space-y-4 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-white">{monthLabel}</p>
            <button
              onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              disabled={monthCursor.getFullYear() === new Date().getFullYear() && monthCursor.getMonth() === new Date().getMonth()}
              className="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW_LABELS.map((d, i) => (
              <div key={i} className="text-center text-[10px] text-text-tertiary font-medium py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, i) => {
              if (cell.day === null) return <div key={i} />;
              const hasWorkout = cell.key ? byDay.has(cell.key) : false;
              const isToday = cell.key === todayKey;
              const isSelected = cell.key === selectedDay;
              return (
                <button
                  key={i}
                  disabled={!hasWorkout}
                  onClick={() => openDay(cell.key)}
                  className={`aspect-square rounded-lg text-xs flex flex-col items-center justify-center gap-0.5 transition-colors ${
                    isSelected ? 'bg-accent text-black font-bold' :
                    hasWorkout ? 'bg-accent-muted text-accent font-semibold hover:bg-accent/30' :
                    'text-text-tertiary'
                  } ${isToday && !isSelected ? 'ring-1 ring-accent/50' : ''}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </Card>

        {!workouts.length ? null : !byDay.size ? null : (
          <p className="text-center text-xs text-text-tertiary">Tap a highlighted date to see that session&apos;s details.</p>
        )}

        {/* Only shown for a day with more than one logged workout — picks
            which one to open before showing the detail modal. */}
        {selectedDay && (
          <div className="space-y-2">
            <p className="text-xs text-text-tertiary uppercase tracking-wide">
              {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            {selectedWorkouts.map((w) => (
              <Card key={w.id} className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => { setDetailWorkout(w); setSelectedDay(null); }}>
                <div className="p-2 bg-accent-muted rounded-xl flex-shrink-0">
                  <Dumbbell className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{w.duration ? `${w.duration} min session` : 'Workout Session'}</p>
                  <p className="text-xs text-text-secondary">{w.exercises?.length ?? 0} exercises · tap for details</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!detailWorkout} onClose={() => setDetailWorkout(null)} title="Workout Detail">
        {detailWorkout && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-surface-elevated rounded-xl">
                <Clock className="w-4 h-4 text-accent mx-auto mb-1" />
                <p className="text-sm font-bold text-white">{detailWorkout.duration ?? '—'}</p>
                <p className="text-[10px] text-text-tertiary">minutes</p>
              </div>
              <div className="p-2.5 bg-surface-elevated rounded-xl">
                <Flame className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                <p className="text-sm font-bold text-white">{detailWorkout.calories ?? '—'}</p>
                <p className="text-[10px] text-text-tertiary">kcal</p>
              </div>
              <div className="p-2.5 bg-surface-elevated rounded-xl">
                <Dumbbell className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                <p className="text-sm font-bold text-white">{detailWorkout.totalWeightLifted ?? 0}{weightUnit}</p>
                <p className="text-[10px] text-text-tertiary">lifted</p>
              </div>
            </div>
            <div className="space-y-3">
              {(detailWorkout.exercises ?? []).map((ex, i) => (
                <div key={i}>
                  <p className="text-sm font-bold text-white mb-1.5">{ex.name}</p>
                  <div className="space-y-1">
                    {ex.sets.map((s, si) => (
                      <div key={si} className={`flex items-center justify-between text-xs px-3 py-1.5 rounded-lg ${s.completed ? 'bg-surface-elevated text-white' : 'bg-white/5 text-text-tertiary line-through'}`}>
                        <span>Set {si + 1}</span>
                        <span>{formatSet(s)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
