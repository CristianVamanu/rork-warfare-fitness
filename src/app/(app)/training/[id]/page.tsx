'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Play, Clock, Target, Dumbbell, Moon, CheckCircle, ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import { getProgram } from '@/lib/firestore';
import { getMockProgram, MOCK_PROGRAMS } from '@/lib/programs';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Program, ProgramDay } from '@/types';

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const goalColors: Record<string, string> = {
  strength: 'accent',
  hypertrophy: 'info',
  endurance: 'success',
  'weight-loss': 'danger',
  general: 'muted',
};

const levelColors: Record<string, string> = {
  beginner: 'success',
  intermediate: 'accent',
  advanced: 'danger',
};

function getTodayDow(): number {
  // JS getDay(): 0=Sun, 1=Mon … 6=Sat → convert to Mon-indexed 0–6
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

function getUpcomingDays(todayDow: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (todayDow + 1 + i) % 7);
}

export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  const todayDow = getTodayDow();

  useEffect(() => {
    if (!id) return;
    getProgram(id)
      .then((p) => {
        if (p && (p as Program).schedule?.length) {
          setProgram(p as Program);
        } else {
          setProgram(getMockProgram(id) ?? (MOCK_PROGRAMS[0] as Program));
        }
      })
      .catch(() => {
        setProgram(getMockProgram(id) ?? (MOCK_PROGRAMS[0] as Program));
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div>
        <Header title="Program" showActions={false} rightElement={
          <button onClick={() => router.back()} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        } />
        <div className="px-4 py-4 space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-16 rounded-xl" />
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div>
        <Header title="Program" showActions={false} />
        <div className="px-4 py-12 text-center">
          <p className="text-text-secondary">Program not found.</p>
          <Button className="mt-4" onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  const todayDay: ProgramDay | undefined = program.schedule?.[todayDow];
  const upcomingDows = getUpcomingDays(todayDow, 5);

  return (
    <div>
      <Header
        title={program.name}
        showActions={false}
        rightElement={
          <button onClick={() => router.back()} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        }
      />
      <div className="px-4 py-4 space-y-5">

        {/* Program Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 relative overflow-hidden bg-gradient-to-br from-surface to-surface-elevated">
            <div className="flex gap-2 mb-3">
              <Badge variant={(goalColors[program.goal] || 'muted') as 'accent' | 'success' | 'danger' | 'info' | 'muted' | 'default'}>
                {program.goal}
              </Badge>
              <Badge variant={(levelColors[program.level] || 'muted') as 'accent' | 'success' | 'danger' | 'info' | 'muted' | 'default'}>
                {program.level}
              </Badge>
            </div>
            <h2 className="text-xl font-black text-white">{program.name}</h2>
            <p className="text-text-secondary text-sm mt-1">{program.description}</p>
            <div className="flex gap-5 mt-3">
              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                <Clock className="w-3 h-3" /> {program.weeks} weeks
              </span>
              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                <Target className="w-3 h-3" /> {program.daysPerWeek} days/week
              </span>
              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                <Dumbbell className="w-3 h-3" /> {program.exercises.length} exercises
              </span>
            </div>
          </Card>
        </motion.div>

        {/* Today's Workout */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <h2 className="text-base font-bold text-white mb-3">Today&apos;s Workout</h2>
          {todayDay ? (
            <Card className={`p-4 ${todayDay.isRest ? 'border-white/5' : 'border-accent/30'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {todayDay.isRest ? (
                    <Moon className="w-4 h-4 text-text-tertiary" />
                  ) : (
                    <Dumbbell className="w-4 h-4 text-accent" />
                  )}
                  <span className="text-sm font-bold text-white">{todayDay.label}</span>
                  {todayDay.isRest && <Badge variant="muted">Rest</Badge>}
                </div>
                {!todayDay.isRest && (
                  <Link href={`/training/session?programId=${program.id}&dow=${todayDow}`}>
                    <Button size="sm">
                      <Play className="w-4 h-4" /> Start
                    </Button>
                  </Link>
                )}
              </div>
              {!todayDay.isRest && todayDay.exercises.length > 0 && (
                <div className="space-y-2 mt-2">
                  {todayDay.exercises.map((ex, i) => (
                    <div key={ex.id ?? i} className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">{ex.name}</span>
                      <span className="text-text-tertiary text-xs">{ex.sets}×{ex.reps}</span>
                    </div>
                  ))}
                </div>
              )}
              {todayDay.isRest && (
                <p className="text-xs text-text-secondary">Recovery day — let your muscles grow.</p>
              )}
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-text-secondary text-sm">No schedule for today.</p>
            </Card>
          )}
        </motion.div>

        {/* Weekly Schedule */}
        {program.schedule && program.schedule.length === 7 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-base font-bold text-white mb-3">Weekly Schedule</h2>
            <div className="space-y-2">
              {program.schedule.map((day, dow) => {
                const isToday = dow === todayDow;
                const isExpanded = expandedDay === dow;
                const isUpcoming = upcomingDows.includes(dow);

                return (
                  <motion.div key={dow} layout>
                    <Card
                      className={`p-4 cursor-pointer transition-colors ${
                        isToday ? 'border-accent/50 bg-accent/5' : ''
                      }`}
                      onClick={() => setExpandedDay(isExpanded ? null : dow)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center text-xs font-bold ${
                            isToday ? 'bg-accent text-black' :
                            day.isRest ? 'bg-surface-elevated text-text-tertiary' :
                            'bg-surface-elevated text-white'
                          }`}>
                            <span>{DOW_LABELS[dow]}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-medium ${isToday ? 'text-white' : 'text-text-secondary'}`}>
                                {day.label}
                              </p>
                              {isToday && <Badge variant="accent">Today</Badge>}
                              {!isToday && isUpcoming && <Badge variant="muted">Upcoming</Badge>}
                            </div>
                            {!day.isRest && (
                              <p className="text-xs text-text-tertiary mt-0.5">
                                {day.exercises.length} exercises
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {day.isRest ? (
                            <Moon className="w-4 h-4 text-text-tertiary" />
                          ) : (
                            <Dumbbell className="w-4 h-4 text-text-tertiary" />
                          )}
                        </div>
                      </div>

                      {/* Expanded exercise list */}
                      {isExpanded && !day.isRest && day.exercises.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 pt-3 border-t border-white/8 space-y-2"
                        >
                          {day.exercises.map((ex, i) => (
                            <div key={ex.id ?? i} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-3 h-3 text-text-tertiary" />
                                <span className="text-sm text-text-secondary">{ex.name}</span>
                              </div>
                              <span className="text-xs text-text-tertiary">{ex.sets}×{ex.reps}</span>
                            </div>
                          ))}
                          {isToday && (
                            <Link href={`/training/session?programId=${program.id}&dow=${dow}`} className="block mt-3">
                              <Button size="sm" fullWidth>
                                <Play className="w-4 h-4" /> Start This Workout
                              </Button>
                            </Link>
                          )}
                        </motion.div>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Start CTA */}
        {todayDay && !todayDay.isRest && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Link href={`/training/session?programId=${program.id}&dow=${todayDow}`}>
              <Button fullWidth size="lg">
                <Play className="w-5 h-5" /> Start Today&apos;s Workout
              </Button>
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
