'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Play, Clock, Target, Dumbbell, Moon, CheckCircle, CheckCircle2, ChevronLeft,
  AlertTriangle, RotateCcw,
} from 'lucide-react';
import { getProgram } from '@/lib/firestore';
import { enrollInProgram } from '@/lib/firestore';
import { getMockProgram, MOCK_PROGRAMS, getProgramDayForUser, stripWeekdayPrefix } from '@/lib/programs';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Program, ProgramDay } from '@/types';

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


export default function ProgramDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [switchModal, setSwitchModal] = useState(false);

  const activeProgram = profile?.activeProgram;
  const isEnrolled = activeProgram?.programId === id;
  const programStartDate = isEnrolled ? (activeProgram?.programStartDate ?? undefined) : undefined;
  const enrolledDayIndex = programStartDate
    ? Math.floor((Date.now() - new Date(programStartDate).getTime()) / 86400000)
    : 0;
  const hasDifferentProgram = !!activeProgram && !isEnrolled;

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

  const handleEnroll = async (force = false) => {
    if (!user || !program) return;
    if (hasDifferentProgram && !force) {
      setSwitchModal(true);
      return;
    }
    setSwitchModal(false);
    setEnrolling(true);
    try {
      await enrollInProgram(user.uid, {
        id: program.id,
        name: program.name,
        weeks: program.weeks,
        daysPerWeek: program.daysPerWeek,
      });
      await refreshProfile();
    } catch (err) {
      console.error('[Enroll] failed:', err);
    } finally {
      setEnrolling(false);
    }
  };

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

  const todayDay: ProgramDay | undefined = isEnrolled
    ? (getProgramDayForUser(program, programStartDate) ?? undefined)
    : undefined;
  const scheduleLen = program.schedule?.length || 1;
  const todayDayIndex = isEnrolled ? (enrolledDayIndex % scheduleLen) : -1;

  const localDateStr = new Date().toLocaleDateString('sv-SE');
  const workedOutToday = profile?.statsCache?.lastWorkoutDate === localDateStr;

  // How many calendar days have fully passed (exclude today itself)
  const passedDays = isEnrolled ? enrolledDayIndex : 0;

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
              {isEnrolled && <Badge variant="success">Enrolled</Badge>}
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
                <Dumbbell className="w-3 h-3" /> {program.schedule ? program.schedule.filter(d => !d.isRest).length : program.daysPerWeek} workout days
              </span>
            </div>

            {/* Enrollment progress bar */}
            {isEnrolled && activeProgram && (
              <div className="mt-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className={workedOutToday ? 'text-success font-medium' : 'text-text-secondary'}>
                    {workedOutToday
                      ? `✓ Day ${activeProgram.completedWorkouts} complete`
                      : `${activeProgram.completedWorkouts} workouts done`}
                  </span>
                  <span className="text-text-tertiary">{activeProgram.totalWorkouts - activeProgram.completedWorkouts} remaining</span>
                </div>
                <ProgressBar
                  value={activeProgram.completedWorkouts}
                  max={activeProgram.totalWorkouts}
                  color={workedOutToday ? 'success' : 'accent'}
                  size="sm"
                />
              </div>
            )}
          </Card>
        </motion.div>

        {/* Enroll / Continue CTA */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          {isEnrolled ? (
            <div className="space-y-2">
              {workedOutToday ? (
                <div className="p-4 bg-success/10 border border-success/30 rounded-2xl text-center">
                  <CheckCircle2 className="w-6 h-6 text-success mx-auto mb-1.5" />
                  <p className="text-sm font-bold text-white">Day {activeProgram?.completedWorkouts} Complete!</p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Come back tomorrow for Day {(activeProgram?.completedWorkouts ?? 0) + 1}
                  </p>
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => router.push(`/training/session?programId=${program.id}&dow=${enrolledDayIndex}`)}>
                    <RotateCcw className="w-3.5 h-3.5" /> Repeat Today
                  </Button>
                </div>
              ) : todayDay && !todayDay.isRest ? (
                <Button fullWidth size="lg" onClick={() => router.push(`/training/session?programId=${program.id}&dow=${enrolledDayIndex}`)}>
                  <Play className="w-5 h-5" /> Continue — {stripWeekdayPrefix(todayDay.label ?? '')}
                </Button>
              ) : (
                <div className="p-4 bg-surface border border-white/8 rounded-2xl text-center">
                  <Moon className="w-5 h-5 text-text-tertiary mx-auto mb-1" />
                  <p className="text-sm text-text-secondary">Rest day today</p>
                  <p className="text-xs text-text-tertiary mt-0.5">Come back tomorrow</p>
                </div>
              )}
              <Button variant="ghost" fullWidth size="sm" onClick={() => router.push('/training')}>
                <RotateCcw className="w-3.5 h-3.5" /> Switch Program
              </Button>
            </div>
          ) : (
            <Button fullWidth size="lg" loading={enrolling} onClick={() => handleEnroll(false)}>
              <Play className="w-5 h-5" />
              {hasDifferentProgram ? 'Switch to This Program' : 'Start Program'}
            </Button>
          )}
        </motion.div>

        {/* Today's Workout */}
        {isEnrolled && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <h2 className="text-base font-bold text-white mb-3">Today&apos;s Workout</h2>
            {todayDay ? (
              <Card className={`p-4 ${workedOutToday ? 'border-success/30' : todayDay.isRest ? 'border-white/5' : 'border-accent/30'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {workedOutToday ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : todayDay.isRest ? (
                      <Moon className="w-4 h-4 text-text-tertiary" />
                    ) : (
                      <Dumbbell className="w-4 h-4 text-accent" />
                    )}
                    <span className="text-sm font-bold text-white">{stripWeekdayPrefix(todayDay.label)}</span>
                    {workedOutToday ? <Badge variant="success">Done</Badge> : todayDay.isRest ? <Badge variant="muted">Rest</Badge> : null}
                  </div>
                  {!todayDay.isRest && !workedOutToday && (
                    <Button size="sm" onClick={() => router.push(`/training/session?programId=${program.id}&dow=${enrolledDayIndex}`)}>
                      <Play className="w-4 h-4" /> Start
                    </Button>
                  )}
                </div>
                {!todayDay.isRest && todayDay.exercises.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {todayDay.exercises.map((ex, i) => (
                      <div key={ex.id ?? i} className="flex items-center justify-between text-sm">
                        {workedOutToday
                          ? <CheckCircle className="w-3 h-3 text-success flex-shrink-0" />
                          : <CheckCircle className="w-3 h-3 text-text-tertiary flex-shrink-0" />
                        }
                        <span className={`flex-1 ml-2 ${workedOutToday ? 'text-text-secondary line-through' : 'text-text-secondary'}`}>{ex.name}</span>
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
        )}

        {/* Schedule */}
        {program.schedule && program.schedule.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-base font-bold text-white mb-3">
              {isEnrolled && programStartDate ? 'Program Schedule' : 'Weekly Schedule'}
            </h2>
            <div className="space-y-2">
              {program.schedule.map((day, idx) => {
                const isToday = isEnrolled && idx === todayDayIndex;
                const currentWeek = Math.floor(enrolledDayIndex / scheduleLen);
                const absoluteDay = currentWeek * scheduleLen + idx;
                const isPast = isEnrolled && !isToday && absoluteDay < enrolledDayIndex;
                const isDoneToday = isToday && workedOutToday;
                const isCompleted = (isPast || isDoneToday) && !day.isRest;
                const isUpcoming = isEnrolled && !isToday && !isPast &&
                  (idx - todayDayIndex + program.schedule!.length) % program.schedule!.length <= 5;
                const isExpanded = expandedDay === idx;
                const dayLabel = `Day ${idx + 1}`;

                return (
                  <motion.div key={idx} layout>
                    <Card
                      className={`p-4 cursor-pointer transition-colors ${
                        isCompleted ? 'border-success/30 bg-success/5' :
                        isToday ? 'border-accent/50 bg-accent/5' : ''
                      }`}
                      onClick={() => setExpandedDay(isExpanded ? null : idx)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center text-xs font-bold ${
                            isCompleted ? 'bg-success/20 text-success' :
                            isToday ? 'bg-accent text-black' :
                            day.isRest ? 'bg-surface-elevated text-text-tertiary' :
                            'bg-surface-elevated text-white'
                          }`}>
                            {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <span>{dayLabel}</span>}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-medium ${isCompleted ? 'text-success' : isToday ? 'text-white' : 'text-text-secondary'}`}>
                                {stripWeekdayPrefix(day.label ?? '')}
                              </p>
                              {isCompleted && <Badge variant="success">Done</Badge>}
                              {!isCompleted && isToday && <Badge variant="accent">Today</Badge>}
                              {!isCompleted && !isToday && isUpcoming && <Badge variant="muted">Upcoming</Badge>}
                            </div>
                            {!day.isRest && (
                              <p className="text-xs text-text-tertiary mt-0.5">{day.exercises.length} exercises</p>
                            )}
                          </div>
                        </div>
                        {day.isRest ? (
                          <Moon className="w-4 h-4 text-text-tertiary" />
                        ) : isCompleted ? (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        ) : (
                          <Dumbbell className="w-4 h-4 text-text-tertiary" />
                        )}
                      </div>

                      {isExpanded && !day.isRest && day.exercises.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3 pt-3 border-t border-white/8 space-y-2"
                        >
                          {day.exercises.map((ex, i) => (
                            <div key={ex.id ?? i} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CheckCircle className={`w-3 h-3 ${isCompleted ? 'text-success' : 'text-text-tertiary'}`} />
                                <span className={`text-sm ${isCompleted ? 'text-text-secondary line-through' : 'text-text-secondary'}`}>{ex.name}</span>
                              </div>
                              <span className="text-xs text-text-tertiary">{ex.sets}×{ex.reps}</span>
                            </div>
                          ))}
                          {isToday && isEnrolled && !workedOutToday && (
                            <Button size="sm" fullWidth className="mt-3" onClick={(e) => { e.stopPropagation(); router.push(`/training/session?programId=${program.id}&dow=${enrolledDayIndex}`); }}>
                              <Play className="w-4 h-4" /> Start This Workout
                            </Button>
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
      </div>

      {/* Switch Program Modal */}
      <Modal open={switchModal} onClose={() => setSwitchModal(false)} title="Switch Program?">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-400/10 border border-amber-400/20 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">You are currently enrolled in</p>
              <p className="text-sm text-accent font-bold">{activeProgram?.programName}</p>
              <p className="text-xs text-text-secondary mt-1">
                Switching will reset your progress ({activeProgram?.completedWorkouts ?? 0} workouts completed).
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setSwitchModal(false)}>Cancel</Button>
            <Button fullWidth loading={enrolling} onClick={() => handleEnroll(true)}>
              Switch to {program.name}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
