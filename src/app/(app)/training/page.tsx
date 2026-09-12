'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Moon, Dumbbell, Play, ChevronRight, Crown, CheckCircle2, RotateCcw, Lock, Flame, Mountain, Activity } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getPrograms, resolveProgram, getDeletedMockIds, getSystemConfig, getUserCustomPrograms, getAllProgramProgress, skipRestDay } from '@/lib/firestore';
import { MOCK_PROGRAMS, stripWeekdayPrefix, getNextSession, getLastTrainingSlotIndex } from '@/lib/programs';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureAccess } from '@/lib/useFeatureAccess';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Ring } from '@/components/dashboard/Ring';
import type { Program } from '@/types';

export default function TrainingPage() {
  const { user, profile } = useAuth();
  // One read for the whole list — useFeatureAccess can't be called per
  // program inside the map, since hooks cannot run in a loop.
  const { otherProgramsLocked: programsLockedByPlan } = useFeatureAccess();
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
  // Whether the resolve has FINISHED — distinct from whether it found
  // anything. The card below keys on the activeProgram pointer stored on the
  // user doc, which outlives the program it points at: a program that has
  // since been deleted (or a built-in removed from the seed data) leaves a
  // member enrolled in something that no longer resolves, and they'd get a
  // card with no sessions and no way out of it.
  const [activeResolved, setActiveResolved] = useState(false);
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
    setActiveResolved(false);
    resolveProgram(activeProgram.programId)
      .then((p) => { setResolvedActive(p); setActiveResolved(true); })
      .catch(() => { setResolvedActive(null); setActiveResolved(true); });
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
    // deletedMocks was missing here. This list filtered hidden built-ins and
    // ignored permanently deleted ones entirely — it only looked correct
    // because "Delete forever" was reachable only for already-hidden
    // programs, so every deleted id happened to also be a hidden id. That is
    // a coincidence of one screen's flow, not a guarantee, and the moment it
    // stopped holding, deleted programs would have reappeared for every user
    // while the admin panel insisted they were gone. The landing page's
    // /api/public/programs already filtered both.
    Promise.all([
      getPrograms(),
      getDeletedMockIds().catch(() => [] as string[]),
      getSystemConfig().catch(() => null),
    ])
      .then(([firestoreProgs, deletedIds, cfg]) => {
        const fp = firestoreProgs as unknown as Program[];
        const fpIds = new Set(fp.map((p) => p.id));
        // Once the built-ins have been imported into the database, the
        // bundled copies are not a source of programs any more — the admin
        // panel is. Merging them back in would resurrect anything deleted
        // since, which is the whole thing the import exists to end.
        const suppressed = new Set(deletedIds);
        const mocks = cfg?.builtinsImported
          ? []
          : MOCK_PROGRAMS.filter((m) => !fpIds.has(m.id) && !suppressed.has(m.id));
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
  // Show a handful, not the whole catalogue. This is a browsing improvement
  // rather than a loading one — the list arrives in a single request and the
  // cards carry no images, so nothing is deferred by showing fewer. What it
  // does buy is a screen you can take in at a glance instead of a long scroll
  // past every program to reach the filters you actually wanted.
  const PROGRAMS_PAGE = 4;
  const [visibleCount, setVisibleCount] = useState(PROGRAMS_PAGE);
  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  // Changing the filter re-shows the first page — otherwise picking a filter
  // after "Load more" leaves an expanded count applied to a different, often
  // much shorter list, and the button vanishes for no visible reason.
  useEffect(() => { setVisibleCount(PROGRAMS_PAGE); }, [filter]);

  const GOAL_ICON: Record<string, React.ElementType> = {
    strength: Dumbbell, hypertrophy: Flame, endurance: Mountain, 'weight-loss': Flame, general: Activity,
  };
  const GOAL_LABEL: Record<string, string> = {
    strength: 'Strength', hypertrophy: 'Muscle', endurance: 'Selection', 'weight-loss': 'Fat loss', general: 'General',
  };
  const levelTone: Record<string, 'ok' | 'accent' | 'danger'> = { beginner: 'ok', intermediate: 'accent', advanced: 'danger' };

  // One card for every program in either list — same anatomy for built-in,
  // admin-published and self-built programs, so the list reads as one set.
  const ProgramRow = ({ prog, isActive, saved, locked, index }: {
    prog: Program; isActive: boolean; saved?: { completedWorkouts: number }; locked?: boolean; index: number;
  }) => {
    const GoalIcon = GOAL_ICON[prog.goal] ?? Dumbbell;
    const gender = (prog as { targetGender?: string }).targetGender;
    const premium = (prog as { isPremium?: boolean }).isPremium;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 6) * 0.04 }}>
        <Link href={`/training/${prog.id}`} className="block">
          <Card glass className={`p-4 flex gap-3.5 card-float ${isActive ? 'border-accent/40 shadow-glow-sm' : ''}`}>
            <span
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-accent flex-shrink-0 border border-accent/25"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb) / 0.32), rgba(var(--accent-rgb) / 0.06))' }}
            >
              <GoalIcon className="w-6 h-6" strokeWidth={2} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">
                    {GOAL_LABEL[prog.goal] ?? prog.goal}{gender && gender !== 'anyone' ? ` · ${gender}` : ''}
                  </p>
                  <h3 className="text-[15px] font-extrabold text-white leading-tight mt-0.5 truncate">{prog.name}</h3>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-1" />
              </div>
              <p className="text-xs text-text-secondary mt-1.5 line-clamp-2 leading-relaxed">{prog.description}</p>
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span className="inline-flex items-center h-6 px-2 rounded-full bg-white/6 text-[11px] font-semibold text-text-secondary tabular-nums">{prog.weeks} wk</span>
                <span className="inline-flex items-center h-6 px-2 rounded-full bg-white/6 text-[11px] font-semibold text-text-secondary tabular-nums">{prog.daysPerWeek} d/wk</span>
                <Badge variant={levelTone[prog.level] === 'ok' ? 'success' : levelTone[prog.level] === 'danger' ? 'danger' : 'accent'}>{prog.level}</Badge>
                {isActive && <Badge variant="success">Active</Badge>}
                {!isActive && saved && <Badge variant="muted">Continue · {saved.completedWorkouts} done</Badge>}
                {locked
                  ? <Badge variant="accent"><Lock className="w-3 h-3 inline mr-0.5" />Upgrade to unlock</Badge>
                  : premium && !isActive && <Badge variant="info"><Crown className="w-3 h-3 inline mr-0.5" />Premium</Badge>}
              </div>
            </div>
          </Card>
        </Link>
      </motion.div>
    );
  };

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px]"
        style={{ background: 'radial-gradient(90% 55% at 50% -8%, rgba(var(--accent-rgb) / 0.26), rgba(var(--accent-rgb) / 0) 70%)' }}
      />
      <div className="relative">
      <Header title="Training" />
      <div className="px-4 py-4 space-y-4">
        {/* Active program */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          {activeProgram && activeResolved && !resolvedActive ? (
            <Card glass className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">Active program</p>
              <h3 className="text-lg font-extrabold text-white mt-1">This program has been removed</h3>
              <p className="text-text-secondary text-sm mt-1">Your progress is safe. Pick another program below to carry on.</p>
            </Card>
          ) : activeProgram ? (
            <Card glass className="p-5 border-accent/30 shadow-glow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-accent">Active program</p>
                  <h3 className="text-[22px] font-black text-white leading-tight mt-1 truncate">{activeProgram.programName}</h3>
                  {todayDay && (
                    <p className="text-text-secondary text-sm mt-1">
                      {isRestToday ? 'Rest day — recover, or skip it below' : `Next: ${stripWeekdayPrefix(todayDay.label)}`}
                    </p>
                  )}
                </div>
                <Ring value={activeProgram.totalWorkouts > 0 ? activeProgram.completedWorkouts / activeProgram.totalWorkouts : 0} size={64} stroke={6}>
                  <span className="text-[15px] font-black text-white tabular-nums">{pct}<span className="text-[10px] font-bold text-text-secondary">%</span></span>
                </Ring>
              </div>
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <Badge variant="accent">{programFinished ? '🎉 Program complete' : `${activeProgram.completedWorkouts} of ${activeProgram.totalWorkouts} sessions`}</Badge>
                {workedOutToday && (
                  <Badge variant="success"><CheckCircle2 className="w-3 h-3 inline mr-0.5" />Day {Math.max(1, completedWorkouts)} done today</Badge>
                )}
              </div>
              <div className="mt-4 space-y-2">
                {todayDay && (isRestToday ? (
                  <Button fullWidth variant="secondary" loading={skippingRest} onClick={handleSkipRest}>
                    <Moon className="w-4 h-4" /> Skip rest day{nextSession?.nextTraining ? ` · ${stripWeekdayPrefix(nextSession.nextTraining.day.label)}` : ''}
                  </Button>
                ) : (
                  <Button fullWidth onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${nextAbsIdx}`)}>
                    <Play className="w-4 h-4" /> {workedOutToday ? 'Start another session' : 'Start session'}
                  </Button>
                ))}
                <div className={`grid gap-2 ${workedOutToday && repeatIdx !== null ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {workedOutToday && repeatIdx !== null && (
                    <Button size="sm" variant="ghost" className="justify-center" onClick={() => router.push(`/training/session?programId=${activeProgram.programId}&dow=${repeatIdx}`)}>
                      <RotateCcw className="w-4 h-4" /> Repeat
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="justify-center" onClick={() => router.push(`/training/${activeProgram.programId}`)}>
                    View program
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card glass className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">No active program</p>
              <h3 className="text-lg font-extrabold text-white mt-1">Pick your fight.</h3>
              <p className="text-text-secondary text-sm mt-1">Choose a program below and your first session is written before you get to the gym.</p>
            </Card>
          )}
        </motion.div>

        {/* My Built Programs */}
        {customPrograms.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary px-0.5 mb-2">My built programs</p>
            <div className="space-y-2.5">
              {customPrograms.map((prog, i) => (
                <ProgramRow key={prog.id} prog={prog} index={i} isActive={activeProgram?.programId === prog.id} saved={savedProgressMap[prog.id]} />
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="-mx-4 px-4 overflow-x-auto">
          <div className="inline-flex gap-0.5 p-[3px] rounded-full bg-surface border border-white/8 w-max">
            {['all', 'strength', 'hypertrophy', 'weight-loss', 'beginner', 'intermediate', 'advanced'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  filter === f ? 'bg-white text-black' : 'text-text-secondary hover:text-white'
                }`}
              >
                {f === 'all' ? 'All' : f === 'weight-loss' ? 'Fat loss' : f === 'hypertrophy' ? 'Muscle' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Programs */}
        <div>
          <div className="flex items-center justify-between px-0.5 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary">Programs</p>
            {!loading && <p className="text-[11px] text-text-tertiary tabular-nums">{filtered.length} available</p>}
          </div>
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
          ) : (
            <div className="space-y-2.5">
              {visible.map((prog, i) => {
                const isActive = activeProgram?.programId === prog.id;
                // Locked programs stay in the list, badged, with their real
                // description — hiding them hides the reason to upgrade.
                const isLockedByPlan = programsLockedByPlan && !isActive;
                return <ProgramRow key={prog.id} prog={prog} index={i} isActive={isActive} saved={savedProgressMap[prog.id]} locked={isLockedByPlan} />;
              })}
              {remaining > 0 && (
                <Button fullWidth variant="secondary" onClick={() => setVisibleCount((n) => n + PROGRAMS_PAGE)}>
                  Load more ({remaining})
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
