'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { getIdToken } from 'firebase/auth';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Play, Clock, Target, Dumbbell, Moon, CheckCircle, CheckCircle2, ChevronLeft,
  AlertTriangle, RotateCcw, Lock, Crown,
} from 'lucide-react';
import { resolveProgram, enrollInProgram, getMembershipConfig } from '@/lib/firestore';
import { getMockProgram, MOCK_PROGRAMS, stripWeekdayPrefix, getScheduleForWeek, getProgramDayForDow, getNextSession } from '@/lib/programs';
import { getProgramDayLimit } from '@/lib/membership';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Program, ProgramDay, MembershipConfig } from '@/types';

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
  const [purchasing, setPurchasing] = useState(false);
  const [membershipConfig, setMembershipConfig] = useState<MembershipConfig | null>(null);
  const [membershipLoaded, setMembershipLoaded] = useState(false);

  useEffect(() => {
    getMembershipConfig().then(setMembershipConfig).catch(() => setMembershipConfig(null)).finally(() => setMembershipLoaded(true));
  }, []);

  // Infinity until membership config has actually loaded — treating an
  // unloaded config as "no limit" avoids a flash of locked days that then
  // unlock a moment later once the real config arrives.
  const dayLimit = membershipLoaded ? getProgramDayLimit(membershipConfig, profile) : Infinity;

  const activeProgram = profile?.activeProgram;
  const isEnrolled = activeProgram?.programId === id;
  const localDateStr = new Date().toLocaleDateString('sv-SE');
  const completedWorkouts = activeProgram?.completedWorkouts ?? 0;

  // lastCompleted: absolute 0-based day index of the last completed unique day.
  const lastCompleted = activeProgram?.lastCompletedDayIndex !== undefined
    ? activeProgram.lastCompletedDayIndex
    : (completedWorkouts > 0 ? completedWorkouts - 1 : -1);

  // workedOutToday: did the user complete a workout today (for this or any program)?
  const workedOutToday = completedWorkouts > 0 && profile?.statsCache?.lastWorkoutDate === localDateStr;

  const hasDifferentProgram = !!activeProgram && !isEnrolled;

  useEffect(() => {
    if (!id) return;
    // Shared resolver (Firestore-first, seed fallback) — same source of
    // truth as the dashboard card and workout session, so this page can
    // never show a different schedule than the rest of the app.
    resolveProgram(id)
      .then((p) => setProgram(p ?? (MOCK_PROGRAMS[0] as Program)))
      .catch(() => setProgram(getMockProgram(id) ?? (MOCK_PROGRAMS[0] as Program)))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Single source of truth for "which day is the user on" ──────────────────
  // nextAbsIdx: the absolute day index the user is targeting next.
  // If worked out today → show today's completed day; else → advance to next.
  // Every phase's schedule is enforced to be 7 entries (same invariant as
  // the original single `schedule`), so this length is a program-wide
  // constant regardless of which phase is actually active.
  const scheduleLen = (program?.phases?.[0]?.schedule ?? program?.schedule)?.length || 1;
  // getNextSession skips stale rest slots (deadlock fix) — same shared
  // logic as the dashboard card and training list, so all three screens
  // always agree on what the user should do next.
  const nextSession = program && isEnrolled && !workedOutToday
    ? getNextSession(program, lastCompleted, profile?.statsCache?.lastWorkoutDate)
    : null;
  const nextAbsIdx = isEnrolled
    ? (workedOutToday ? lastCompleted : (nextSession?.index ?? lastCompleted + 1))
    : 0;
  const todayDayIndex = nextAbsIdx % scheduleLen; // which slot in the 7-day template
  const currentWeek = Math.floor(nextAbsIdx / scheduleLen); // 0-based week the user is in
  // Use whichever is larger: program's declared weeks or the user's actual progress
  const totalWeeks = Math.max(program?.weeks || 1, currentWeek + 1);
  // Never locks a day already completed (workedOutToday means nextAbsIdx
  // points at what was just finished, not the next new day).
  const nextIsLocked = isEnrolled && !workedOutToday && nextAbsIdx >= dayLimit;

  // The FULL program, every week, in one flat list — previously paginated
  // one week at a time behind arrow buttons, which meant the trial day-lock
  // (see dayLimit above) was invisible unless a user manually paged forward
  // past their free week(s) first. Phase-aware per week via
  // getScheduleForWeek, same as before.
  const allWeeks: { week: number; days: ProgramDay[] }[] = program
    ? Array.from({ length: totalWeeks }, (_, w) => ({ week: w + 1, days: getScheduleForWeek(program, w + 1) ?? [] }))
    : [];
  const todayDay: ProgramDay | null = workedOutToday
    ? (program ? getProgramDayForDow(program, lastCompleted) : null)
    : (nextSession?.day ?? null);
  const isRestToday = isEnrolled && !workedOutToday && (nextSession?.isRestToday ?? false);

  // Auto-scroll to today's slot once the full list has rendered — a 12+
  // week program is a long scroll, and nobody wants to hunt for "today"
  // by eye through 80+ rows every time they open this page.
  const autoScrolledRef = useRef(false);
  useEffect(() => {
    if (!isEnrolled || loading || autoScrolledRef.current) return;
    autoScrolledRef.current = true;
    const el = document.getElementById(`program-day-${nextAbsIdx}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [isEnrolled, loading, nextAbsIdx]);

  const handleEnroll = async (force = false) => {
    if (!user || !program) return;
    // Defense-in-depth — the button that calls this is already hidden
    // behind isMembershipLocked, but never trust a client-side gate alone.
    if (program.isPremium && !hasMembership) return;
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
      toast.error('Could not enroll — please try again.');
    } finally {
      setEnrolling(false);
    }
  };

  const hasPurchased = !!(program?.id && profile?.purchasedProgramIds?.includes(program.id));
  const hasMembership = profile?.membership?.status === 'active' || profile?.coaching?.status === 'active';
  const needsPurchase = !!program?.price && program.price > 0 && !hasPurchased && !hasMembership;
  // program.isPremium was previously admin-toggleable (Admin → Programs)
  // but never actually checked anywhere — the toggle showed a "Premium"
  // badge and did nothing else, so marking a program premium never
  // actually restricted access to it. Unlike `price` (a one-time purchase
  // alternative), isPremium means membership-only with no purchase bypass.
  const isMembershipLocked = !!program?.isPremium && !hasMembership;

  const handleBuyProgram = async () => {
    if (!user || !program) return;
    setPurchasing(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/stripe/program-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userEmail: user.email, programId: program.id }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else {
        toast.error(data.error || 'Could not start checkout — please try again.');
        setPurchasing(false);
      }
    } catch (err) {
      console.error('[BuyProgram] failed:', err);
      toast.error('Could not start checkout — please try again.');
      setPurchasing(false);
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
            {/* whitespace-pre-line — admins write these as short paragraphs/
                line-broken lists for readability; plain flowing text
                collapsed every newline they typed, making a carefully
                formatted description read as one dense wall of text. */}
            <p className="text-text-secondary text-sm mt-1 whitespace-pre-line">{program.description}</p>
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
                      ? `✓ Day ${Math.max(1, completedWorkouts)} complete`
                      : `${completedWorkouts} workouts done`}
                  </span>
                  <span className="text-text-tertiary">{activeProgram.totalWorkouts - completedWorkouts} remaining</span>
                </div>
                <ProgressBar
                  value={completedWorkouts}
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
              {nextIsLocked ? (
                <div className="p-4 bg-surface border border-accent/30 rounded-2xl text-center">
                  <Lock className="w-6 h-6 text-accent mx-auto mb-1.5" />
                  <p className="text-sm font-bold text-white">Free Trial Limit Reached</p>
                  <p className="text-xs text-text-secondary mt-0.5 mb-3">
                    Your trial covers the first {dayLimit} days of this program. Subscribe to keep training.
                  </p>
                  <Button size="sm" fullWidth onClick={() => router.push('/profile')}>
                    <Crown className="w-4 h-4" /> View Plans
                  </Button>
                </div>
              ) : workedOutToday ? (
                <div className="p-4 bg-success/10 border border-success/30 rounded-2xl text-center">
                  <CheckCircle2 className="w-6 h-6 text-success mx-auto mb-1.5" />
                  <p className="text-sm font-bold text-white">Day {Math.max(1, completedWorkouts)} Complete!</p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Come back tomorrow for Day {completedWorkouts + 1}
                  </p>
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => router.push(`/training/session?programId=${program.id}&dow=${nextAbsIdx}`)}>
                    <RotateCcw className="w-3.5 h-3.5" /> Repeat Today
                  </Button>
                </div>
              ) : todayDay && !isRestToday ? (
                <Button fullWidth size="lg" onClick={() => router.push(`/training/session?programId=${program.id}&dow=${nextAbsIdx}`)}>
                  <Play className="w-5 h-5" /> Start — {stripWeekdayPrefix(todayDay.label ?? '')}
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
          ) : isMembershipLocked ? (
            <div className="p-4 bg-surface border border-accent/30 rounded-2xl text-center">
              <Lock className="w-6 h-6 text-accent mx-auto mb-1.5" />
              <p className="text-sm font-bold text-white">Members Only</p>
              <p className="text-xs text-text-secondary mt-0.5 mb-3">
                This program is included with an active membership. Subscribe to unlock it.
              </p>
              <Button size="sm" fullWidth onClick={() => router.push('/profile')}>
                <Crown className="w-4 h-4" /> View Plans
              </Button>
            </div>
          ) : needsPurchase ? (
            <div className="space-y-2">
              <Button fullWidth size="lg" loading={purchasing} onClick={handleBuyProgram}>
                <Play className="w-5 h-5" /> Buy Program — ${program.price!.toFixed(2)}
              </Button>
              <p className="text-xs text-text-tertiary text-center">One-time purchase. Full platform members get this program included.</p>
            </div>
          ) : (
            <Button fullWidth size="lg" loading={enrolling} onClick={() => handleEnroll(false)}>
              <Play className="w-5 h-5" />
              {hasDifferentProgram ? 'Switch to This Program' : 'Start Program'}
            </Button>
          )}
        </motion.div>

        {/* Today's Workout — hidden once the trial's day-limit is hit;
            the CTA above already explains the lock and offers to subscribe. */}
        {isEnrolled && todayDay && !nextIsLocked && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <h2 className="text-base font-bold text-white mb-3">Today&apos;s Workout</h2>
            <Card className={`p-4 ${workedOutToday ? 'border-success/30' : isRestToday ? 'border-white/5' : 'border-accent/30'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {workedOutToday ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : isRestToday ? (
                    <Moon className="w-4 h-4 text-text-tertiary" />
                  ) : (
                    <Dumbbell className="w-4 h-4 text-accent" />
                  )}
                  <span className="text-sm font-bold text-white">{stripWeekdayPrefix(todayDay.label)}</span>
                  {workedOutToday ? <Badge variant="success">Done</Badge> : isRestToday ? <Badge variant="muted">Rest</Badge> : null}
                </div>
                {!isRestToday && !workedOutToday && (
                  <Button size="sm" onClick={() => router.push(`/training/session?programId=${program.id}&dow=${nextAbsIdx}`)}>
                    <Play className="w-4 h-4" /> Start
                  </Button>
                )}
              </div>
              {!isRestToday && todayDay.exercises.length > 0 && (
                <div className="space-y-2 mt-2">
                  {todayDay.exercises.map((ex, i) => (
                    <div key={ex.id ?? i} className="flex items-center justify-between text-sm">
                      <CheckCircle className={`w-3 h-3 flex-shrink-0 ${workedOutToday ? 'text-success' : 'text-text-tertiary'}`} />
                      <span className={`flex-1 ml-2 ${workedOutToday ? 'text-text-secondary line-through' : 'text-text-secondary'}`}>{ex.name}</span>
                      <span className="text-text-tertiary text-xs">{ex.sets}×{ex.reps}</span>
                    </div>
                  ))}
                </div>
              )}
              {isRestToday && (
                <p className="text-xs text-text-secondary">Recovery day — let your muscles grow.</p>
              )}
            </Card>
          </motion.div>
        )}

        {/* Schedule — the FULL program, every week, in one continuous list.
            Previously paginated one week at a time behind arrow buttons,
            which meant the trial day-lock below was invisible unless a
            user manually paged forward past their free days first. */}
        {allWeeks.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-white">
                {isEnrolled ? `Full Program — ${totalWeeks} Weeks` : 'Weekly Schedule'}
              </h2>
              {isEnrolled && (
                <button
                  onClick={() => document.getElementById(`program-day-${nextAbsIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="text-xs text-accent hover:underline flex-shrink-0"
                >
                  Jump to Today
                </button>
              )}
            </div>

            <div className="space-y-4">
              {allWeeks.map(({ week, days }) => (
                <div key={week}>
                  <p className="text-xs font-bold text-text-tertiary uppercase tracking-wide mb-2 px-1">
                    Week {week}{week === currentWeek + 1 && isEnrolled ? ' · Current' : ''}
                  </p>
                  <div className="space-y-2">
                    {days.map((day, idx) => {
                      const weekIdx = week - 1;
                      // Absolute index of this slot across the whole program
                      const absoluteDay = weekIdx * scheduleLen + idx;
                      // Is this slot the one the user is currently on?
                      const isToday = isEnrolled && weekIdx === currentWeek && idx === todayDayIndex;
                      const isPast = isEnrolled && absoluteDay < nextAbsIdx && !isToday;
                      const isDoneToday = isToday && workedOutToday;
                      const isCompleted = (isPast || isDoneToday) && !day.isRest;
                      const isExpanded = expandedDay === absoluteDay;

                      const isUpcoming = isEnrolled && !isToday && !isPast;
                      // Never locks a day the user already trained — this caps
                      // how much NEW progress a lapsed-trial user can make, not
                      // access to what they've already done.
                      const isLocked = absoluteDay >= dayLimit && !isCompleted;

                      return (
                        <motion.div key={`${week}-${idx}`} layout id={`program-day-${absoluteDay}`}>
                          <Card
                            className={`p-4 cursor-pointer transition-colors ${
                              isLocked ? 'opacity-60' :
                              isCompleted ? 'border-success/30 bg-success/5' :
                              isToday ? 'border-accent/50 bg-accent/5' : ''
                            }`}
                            onClick={() => setExpandedDay(isExpanded ? null : absoluteDay)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center text-xs font-bold ${
                                  isCompleted ? 'bg-success/20 text-success' :
                                  isToday ? 'bg-accent text-black' :
                                  day.isRest ? 'bg-surface-elevated text-text-tertiary' :
                                  'bg-surface-elevated text-white'
                                }`}>
                                  {isCompleted
                                    ? <CheckCircle2 className="w-5 h-5" />
                                    : isLocked
                                    ? <Lock className="w-4 h-4 text-text-tertiary" />
                                    : <span className="text-center leading-none">{`D${idx + 1}`}</span>
                                  }
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className={`text-sm font-medium ${isCompleted ? 'text-success' : isToday ? 'text-white' : 'text-text-secondary'}`}>
                                      {stripWeekdayPrefix(day.label ?? '')}
                                    </p>
                                    {isCompleted && <Badge variant="success">Done</Badge>}
                                    {isLocked && <Badge variant="muted">Members Only</Badge>}
                                    {!isCompleted && !isLocked && isToday && <Badge variant="accent">Today</Badge>}
                                    {!isCompleted && !isLocked && !isToday && isUpcoming && !day.isRest && <Badge variant="muted">Upcoming</Badge>}
                                  </div>
                                  {!day.isRest && (
                                    <p className="text-xs text-text-tertiary mt-0.5">{day.exercises.length} exercises</p>
                                  )}
                                </div>
                              </div>
                              {isLocked ? (
                                <Lock className="w-4 h-4 text-text-tertiary" />
                              ) : day.isRest ? (
                                <Moon className="w-4 h-4 text-text-tertiary" />
                              ) : isCompleted ? (
                                <CheckCircle2 className="w-4 h-4 text-success" />
                              ) : (
                                <Dumbbell className="w-4 h-4 text-text-tertiary" />
                              )}
                            </div>

                            {isExpanded && isLocked && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-3 pt-3 border-t border-white/8 text-center"
                              >
                                <p className="text-xs text-text-secondary mb-2.5">
                                  Your free trial covers the first {dayLimit} days of this program. Subscribe to keep going from here.
                                </p>
                                <Button size="sm" fullWidth onClick={(e) => { e.stopPropagation(); router.push('/profile'); }}>
                                  <Crown className="w-3.5 h-3.5" /> View Plans
                                </Button>
                              </motion.div>
                            )}
                            {isExpanded && !isLocked && !day.isRest && day.exercises.length > 0 && (
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
                                  <Button size="sm" fullWidth className="mt-3" onClick={(e) => { e.stopPropagation(); router.push(`/training/session?programId=${program.id}&dow=${nextAbsIdx}`); }}>
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
                </div>
              ))}
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
