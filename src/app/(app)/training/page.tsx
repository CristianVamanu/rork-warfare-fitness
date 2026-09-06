'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Moon, Dumbbell, Play, Clock, Target, ChevronRight, Crown, CheckCircle2, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getPrograms, resolveProgram, getHiddenMockIds, getUserCustomPrograms, getAllProgramProgress, skipRestDay } from '@/lib/firestore';
import { MOCK_PROGRAMS, stripWeekdayPrefix, getNextSession, getLastTrainingSlotIndex } from '@/lib/programs';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Program } from '@/types';

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

export default function TrainingPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [customPrograms, setCustomPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const activeProgram = profile?.activeProgram;

  // ── Single source of truth for "which day is the user on" — mirrors
  // dashboard and training/[id]. lastCompletedDayIndex is authoritative;
  // programStartDate is never used for display/navigation.
  const localDateStr = new Date().toLocaleDateString('sv-SE');
  const completedWorkouts = activeProgram?.completedWorkouts ?? 0;
  const lastCompleted = activeProgram?.lastCompletedDayIndex !== undefined
    ? activeProgram.lastCompletedDayIndex
    : (completedWorkouts > 0 ? completedWorkouts - 1 : -1);
  const workedOutToday = completedWorkouts > 0 && profile?.statsCache?.lastWorkoutDate === localDateStr;

  const [resolvedActive, setResolvedActive] = useState<Program | null>(null);
  // Saved (non-active) per-program progress, keyed by programId — powers
  // the "Continue — Week X • Day Y" line on programs other than the
  // currently active one, so switching away and back is visibly
  // non-destructive right from this browse list.
  const [savedProgressMap, setSavedProgressMap] = useState<Record<string, { completedWorkouts: number }>>({});
  useEffect(() => {
    if (!user) { setSavedProgressMap({}); return; }
    getAllProgramProgress(user.uid)
      .then((all) => {
        const nonActive: Record<string, { completedWorkouts: number }> = {};
        for (const [pid, p] of Object.entries(all)) {
          if (!p.isActive) nonActive[pid] = { completedWorkouts: p.completedWorkouts };
        }
        setSavedProgressMap(nonActive);
      })
      .catch(() => setSavedProgressMap({}));
  }, [user, activeProgram?.programId]);
  // Clamped to 100: getScheduleForWeek has no "program finished" concept of
  // its own — once a user's position runs past the program's last defined
  // week, it just keeps repeating that final phase's schedule rather than
  // stopping, so completedWorkouts can keep climbing past totalWorkouts.
  // Without clamping, that read as "112%" or "9/8 sessions" instead of a
  // completed program.
  const pct = activeProgram && activeProgram.totalWorkouts > 0
    ? Math.min(100, Math.round((activeProgram.completedWorkouts / activeProgram.totalWorkouts) * 100))
    : 0;
  const programFinished = !!activeProgram && activeProgram.completedWorkouts >= activeProgram.totalWorkouts;

  // Shared resolver (Firestore-first, seed fallback) — this used to prefer
  // the built-in seed copy over the admin's saved Firestore edits, the
  // exact opposite precedence of the program detail page, which is how two
  // screens ended up disagreeing about the same program's schedule.
  useEffect(() => {
    if (!activeProgram) { setResolvedActive(null); return; }
    resolveProgram(activeProgram.programId)
      .then(setResolvedActive)
      .catch(() => setResolvedActive(null));
  }, [activeProgram]);

  // getNextSession skips stale rest slots (deadlock fix) — same shared
  // logic as the dashboard card and program detail page. Always points at
  // the next not-yet-completed day regardless of workedOutToday — training
  // twice in one day is allowed, not blocked until the calendar date rolls
  // over (see training/[id]/page.tsx for the full rationale).
  const nextSession = resolvedActive && activeProgram
    ? getNextSession(resolvedActive, lastCompleted, profile?.statsCache?.lastWorkoutDate)
    : null;
  const nextAbsIdx = activeProgram ? (nextSession?.index ?? lastCompleted + 1) : 0;
  const todayDay = nextSession?.day ?? null;
  const isRestToday = nextSession?.isRestToday ?? false;
  const repeatIdx = resolvedActive ? getLastTrainingSlotIndex(resolvedActive, lastCompleted) : null;
  const [skippingRest, setSkippingRest] = useState(false);
  const handleSkipRest = async () => {
    if (!user || !activeProgram?.programId || !nextSession?.isRestToday) return;
    setSkippingRest(true);
    try {
      const res = await skipRestDay(user.uid, activeProgram.programId, nextSession.index);
      if (!res.ok) {
        toast.error(
          res.reason === 'locked'
            ? 'Your trial covers a limited number of days — upgrade to keep going.'
            : res.reason === 'not-a-rest-day'
            ? 'That session is a workout, not a rest day.'
            : 'Could not skip the rest day. Try again.'
        );
      }
    } catch { toast.error('Could not skip the rest day. Try again.'); }
    finally { setSkippingRest(false); }
  };

  useEffect(() => {
    Promise.all([getPrograms(), getHiddenMockIds().catch(() => [] as string[])])
      .then(([firestoreProgs, hiddenIds]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fp = firestoreProgs as any as Program[];
        const fpIds = new Set(fp.map((p) => p.id));
        const hidden = new Set(hiddenIds);
        const mocks = MOCK_PROGRAMS.filter((m) => !fpIds.has(m.id) && !hidden.has(m.id));
        setPrograms([...fp, ...mocks as Program[]]);
      })
      .catch(() => setPrograms(MOCK_PROGRAMS))
      .finally(() => setLoading(false));
  }, []);

  // Personal "Build Your Own" programs never show up in the public browse
  // list above (by design — they're not other users' business), but that
  // used to mean switching away from one made it look gone forever. It was
  // never deleted, just unreachable. Listed here so the user always has a
  // way back to anything they've built.
  useEffect(() => {
    if (!user) { setCustomPrograms([]); return; }
    getUserCustomPrograms(user.uid)
      .then((progs) => setCustomPrograms(progs as unknown as Program[]))
      .catch(() => setCustomPrograms([]));
  }, [user]);

  const filtered = filter === 'all' ? programs : programs.filter((p) => p.goal === filter || p.level === filter);

  return (
    <div>
      <Header title="Training" />
      <div className="px-4 py-4 space-y-5">
        {/* Active Program Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-sm font-medium text-text-secondary mb-2">ACTIVE PROGRAM</h2>
          {activeProgram ? (
            <Card className="p-5 relative overflow-hidden bg-gradient-to-br from-surface to-surface-elevated">
              <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none">
                <Dumbbell className="w-32 h-32 text-accent" />
              </div>
              <Badge variant="accent" className="mb-3">
                {programFinished ? '🎉 Program complete' : `${activeProgram.completedWorkouts}/${activeProgram.totalWorkouts} sessions`}
              </Badge>
              <h3 className="text-xl font-black text-white">{activeProgram.programName}</h3>
              {todayDay && (
                <p className="text-text-secondary text-sm mt-1">
                  {isRestToday ? 'Rest day — recover, or skip it below' : `Next: ${stripWeekdayPrefix(todayDay.label)}`}
                </p>
              )}
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>Progress</span>
                  <span>{pct}%</span>
                </div>
                <ProgressBar value={activeProgram.completedWorkouts} max={activeProgram.totalWorkouts} color="accent" size="sm" />
              </div>
              {/* Non-blocking acknowledgment — training more than once a day
                  is allowed, so the "Start next workout" CTA below always
                  shows alongside this, not instead of it. */}
              {workedOutToday && (
                <div className="mt-4 p-3 bg-success/10 border border-success/30 rounded-xl flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">Day {Math.max(1, completedWorkouts)} complete</p>
                  </div>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {todayDay && (isRestToday ? (
                  <Button fullWidth variant="secondary" loading={skippingRest} onClick={handleSkipRest}>
                    <Moon className="w-4 h-4" /> Skip rest day{nextSession?.nextTraining ? ` · ${stripWeekdayPrefix(nextSession.nextTraining.day.label)}` : ''}
                  </Button>
                ) : (
                  <Button fullWidth onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${nextAbsIdx}`)}>
                    <Play className="w-4 h-4" /> Start Next Workout
                  </Button>
                ))}
                <div className={`grid gap-2 ${workedOutToday && repeatIdx !== null ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {workedOutToday && repeatIdx !== null && (
                    <Button size="sm" variant="ghost" className="justify-center" onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${repeatIdx}`)}>
                      <RotateCcw className="w-4 h-4" /> Repeat
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="justify-center" onClick={() => router.push(`/training/${activeProgram.programId}`)}>
                    View Program
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-5 relative overflow-hidden bg-gradient-to-br from-surface to-surface-elevated">
              <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none">
                <Dumbbell className="w-32 h-32 text-accent" />
              </div>
              <p className="text-text-secondary text-sm mb-2">No active program</p>
              <h3 className="text-lg font-bold text-white">Choose a program below</h3>
              <p className="text-text-secondary text-sm mt-1">Select a program to track your progress</p>
            </Card>
          )}
        </motion.div>

        {/* My Built Programs — personal programs, kept visible even after
            switching to a different one, so nothing built here is ever
            actually lost, just not currently active. */}
        {customPrograms.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-white mb-3">My Built Programs</h2>
            <div className="space-y-3">
              {customPrograms.map((prog, i) => {
                const isActive = activeProgram?.programId === prog.id;
                return (
                  <motion.div
                    key={prog.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link href={`/training/${prog.id}`}>
                      <Card className={`p-4 hover:border-accent/30 transition-colors ${isActive ? 'border-accent/40' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex gap-2 mb-2 flex-wrap">
                              <Badge variant={(goalColors[prog.goal] || 'muted') as 'accent' | 'success' | 'danger' | 'info' | 'muted' | 'default'}>
                                {prog.goal}
                              </Badge>
                              <Badge variant={(levelColors[prog.level] || 'muted') as 'accent' | 'success' | 'danger' | 'info' | 'muted' | 'default'}>
                                {prog.level}
                              </Badge>
                              {isActive && <Badge variant="success">Active</Badge>}
                              {!isActive && savedProgressMap[prog.id] && (
                                <Badge variant="muted">Continue — {savedProgressMap[prog.id].completedWorkouts} done</Badge>
                              )}
                            </div>
                            <h3 className="font-bold text-white">{prog.name}</h3>
                            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{prog.description}</p>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                                <Clock className="w-3 h-3" />{prog.weeks}w
                              </span>
                              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                                <Target className="w-3 h-3" />{prog.daysPerWeek}d/week
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-text-tertiary mt-1 flex-shrink-0" />
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {['all', 'strength', 'hypertrophy', 'weight-loss', 'beginner', 'intermediate', 'advanced'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-accent text-black'
                  : 'bg-surface-elevated border border-white/10 text-text-secondary'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Programs Grid */}
        <div>
          <h2 className="text-base font-bold text-white mb-3">Browse Programs</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((prog, i) => {
                const isActive = activeProgram?.programId === prog.id;
                return (
                  <motion.div
                    key={prog.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link href={`/training/${prog.id}`}>
                      <Card className={`p-4 hover:border-accent/30 transition-colors ${isActive ? 'border-accent/40' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex gap-2 mb-2 flex-wrap">
                              <Badge variant={(goalColors[prog.goal] || 'muted') as 'accent' | 'success' | 'danger' | 'info' | 'muted' | 'default'}>
                                {prog.goal}
                              </Badge>
                              <Badge variant={(levelColors[prog.level] || 'muted') as 'accent' | 'success' | 'danger' | 'info' | 'muted' | 'default'}>
                                {prog.level}
                              </Badge>
                              {isActive && <Badge variant="success">Active</Badge>}
                              {!isActive && savedProgressMap[prog.id] && (
                                <Badge variant="muted">Continue — {savedProgressMap[prog.id].completedWorkouts} done</Badge>
                              )}
                              {(prog as { isPremium?: boolean }).isPremium && <Badge variant="info"><Crown className="w-3 h-3 inline mr-0.5" />Premium</Badge>}
                              {(prog as { targetGender?: string }).targetGender && (prog as { targetGender?: string }).targetGender !== 'anyone' && (
                                <Badge variant="muted">{(prog as { targetGender?: string }).targetGender}</Badge>
                              )}
                            </div>
                            <h3 className="font-bold text-white">{prog.name}</h3>
                            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{prog.description}</p>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                                <Clock className="w-3 h-3" />{prog.weeks}w
                              </span>
                              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                                <Target className="w-3 h-3" />{prog.daysPerWeek}d/week
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-text-tertiary mt-1 flex-shrink-0" />
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
