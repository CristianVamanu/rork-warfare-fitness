'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { getIdToken } from 'firebase/auth';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Play, Clock, Target, Dumbbell, Moon, CheckCircle, CheckCircle2, ChevronLeft,
  Save, RotateCcw, Lock, Crown,
} from 'lucide-react';
import { resolveProgram, enrollInProgram, getMembershipConfig, getAllProgramProgress, skipRestDay } from '@/lib/firestore';
import { getMockProgram, stripWeekdayPrefix, getScheduleForWeek, getNextSession } from '@/lib/programs';
import { getProgramDayLimit, hasActiveSubscription } from '@/lib/membership';
import { useFeatureAccess } from '@/lib/useFeatureAccess';
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
  // Saved position from a previous stint on this exact program, if this
  // isn't the currently active one — lets the CTA say "Resume — Week X Day
  // Y" instead of "Switch to This Program" when there's real progress to
  // pick back up, per the non-destructive program-switching redesign.
  const [savedProgress, setSavedProgress] = useState<{ completedWorkouts: number; lastCompletedDayIndex?: number } | null>(null);

  useEffect(() => {
    getMembershipConfig().then(setMembershipConfig).catch(() => setMembershipConfig(null)).finally(() => setMembershipLoaded(true));
  }, []);

  useEffect(() => {
    if (!user || !id) { setSavedProgress(null); return; }
    getAllProgramProgress(user.uid)
      .then((all) => setSavedProgress(id in all && !all[id].isActive ? all[id] : null))
      .catch(() => setSavedProgress(null));
  }, [user, id, enrolling]);

  // Infinity until membership config has actually loaded — treating an
  // unloaded config as "no limit" avoids a flash of locked days that then
  // unlock a moment later once the real config arrives.
  const dayLimit = membershipLoaded ? getProgramDayLimit(membershipConfig, profile, id) : Infinity;

  const activeProgram = profile?.activeProgram;
  const isEnrolled = activeProgram?.programId === id;
  const localDateStr = new Date().toLocaleDateString('sv-SE');
  const completedWorkouts = activeProgram?.completedWorkouts ?? 0;

  // lastCompleted: absolute 0-based day index of the last completed unique day.
  const lastCompleted = activeProgram?.lastCompletedDayIndex !== undefined
    ? activeProgram.lastCompletedDayIndex
    : (completedWorkouts > 0 ? completedWorkouts - 1 : -1);

  // workedOutToday: did the user complete a workout today (for this or any program)?
  // Purely informational now (shown as a small "nice work" banner) — it no
  // longer blocks progression. It used to force the whole page to show
  // "come back tomorrow" and hide the next day's session entirely, which
  // meant finishing a workout at any time of day locked the user out of
  // starting their next one until the calendar date rolled over — up to a
  // full ~24h wait for someone who trained first thing in the morning.
  // Nothing about program structure requires that; a user who wants to
  // train twice in one day should be able to.
  const workedOutToday = completedWorkouts > 0 && profile?.statsCache?.lastWorkoutDate === localDateStr;

  const hasDifferentProgram = !!activeProgram && !isEnrolled;

  useEffect(() => {
    if (!id) return;
    // Shared resolver (Firestore-first, seed fallback) — same source of
    // truth as the dashboard card and workout session, so this page can
    // never show a different schedule than the rest of the app.
    // A null result here means this id doesn't resolve to any real program
    // (Firestore doc deleted, and not a built-in seed) — surfacing the
    // existing "Program not found" state below is correct. Substituting an
    // unrelated program (this used to fall back to MOCK_PROGRAMS[0]) used
    // to silently show the wrong schedule/exercises for someone whose
    // enrolled "Build Your Own" program got deleted, while their saved
    // progress (lastCompletedDayIndex etc.) kept being interpreted against
    // that unrelated program's schedule length.
    resolveProgram(id)
      .then((p) => setProgram(p))
      .catch(() => setProgram(getMockProgram(id) ?? null))
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
  // Always points at the next NOT-YET-completed day, regardless of whether
  // the user already trained today — getNextSession already advances past
  // lastCompleted and correctly skips a stale rest day using
  // lastWorkoutDate, so there's no need to freeze progress on workedOutToday.
  const nextSession = program && isEnrolled
    ? getNextSession(program, lastCompleted, profile?.statsCache?.lastWorkoutDate)
    : null;
  const nextAbsIdx = isEnrolled ? (nextSession?.index ?? lastCompleted + 1) : 0;
  const todayDayIndex = nextAbsIdx % scheduleLen; // which slot in the 7-day template
  const currentWeek = Math.floor(nextAbsIdx / scheduleLen); // 0-based week the user is in
  // Use whichever is larger: program's declared weeks or the user's actual progress
  const totalWeeks = Math.max(program?.weeks || 1, currentWeek + 1);
  const nextIsLocked = isEnrolled && nextAbsIdx >= dayLimit;

  // The FULL program, every week, in one flat list — previously paginated
  // one week at a time behind arrow buttons, which meant the trial day-lock
  // (see dayLimit above) was invisible unless a user manually paged forward
  // past their free week(s) first. Phase-aware per week via
  // getScheduleForWeek, same as before.
  const allWeeks: { week: number; days: ProgramDay[] }[] = program
    ? Array.from({ length: totalWeeks }, (_, w) => ({ week: w + 1, days: getScheduleForWeek(program, w + 1) ?? [] }))
    : [];
  const todayDay: ProgramDay | null = nextSession?.day ?? null;
  const isRestToday = isEnrolled && (nextSession?.isRestToday ?? false);
  const [skippingRest, setSkippingRest] = useState(false);
  const handleSkipRest = async () => {
    if (!user || !program || !nextSession?.isRestToday) return;
    setSkippingRest(true);
    try {
      const res = await skipRestDay(user.uid, program.id, nextSession.index);
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

  const hasMembership = hasActiveSubscription(profile);
  // Admin can also lock specific programs to members-only via
  // MembershipConfig.lockedProgramIds (Admin → Membership), independently
  // of a program's own isPremium flag — e.g. to temporarily gate a
  // normally-free program without editing the program itself.
  const isLockedByConfig = !!membershipConfig?.enabled && !!program?.id
    && (membershipConfig.lockedProgramIds ?? []).includes(program.id);
  // Only pass a programId to the hook for programs that actually need
  // gating — passing it unconditionally would make useFeatureAccess treat
  // every program as needing the 'premium-programs' entitlement, locking
  // ordinary free programs out for any member whose plan restricts tools
  // at all. This also correctly folds in per-plan tiering (a Conquer
  // subscriber's plan.featureAccess can omit 'premium-programs' while a
  // Vanguard/Hero plan's includes it or is left unrestricted) and honors
  // the free trial the same way every other gated feature does — the
  // previous plain `!hasMembership` check locked premium programs even
  // during an active trial, which was itself a real bug.
  // A program the user has actually BOUGHT is never gated, whatever else
  // it's flagged as. Previously a program that was both isPremium/locked
  // AND priced stayed locked after purchase — the purchase satisfied the
  // price check further down but nothing here, so the enroll button stayed
  // disabled and handleEnroll's own guard returned early. Money taken, no
  // access. (firestore.rules' premiumEnrollAllowed had the same hole and
  // is fixed to match.)
  const alreadyPurchased = !!(program?.id && profile?.purchasedProgramIds?.includes(program.id));
  const gatedProgramId = program && (program.isPremium || isLockedByConfig) && !alreadyPurchased ? program.id : undefined;
  const { isLocked: programAccessLocked } = useFeatureAccess(undefined, gatedProgramId);

  const handleEnroll = async (force = false, restart = false) => {
    if (!user || !program) return;
    // Defense-in-depth — the button that calls this is already hidden
    // behind isMembershipLocked, but never trust a client-side gate alone.
    if (programAccessLocked) return;
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
      }, restart);
      await refreshProfile();
    } catch (err) {
      console.error('[Enroll] failed:', err);
      toast.error('Could not enroll — please try again.');
    } finally {
      setEnrolling(false);
    }
  };

  const hasPurchased = alreadyPurchased;
  const needsPurchase = !!program?.price && program.price > 0 && !hasPurchased && !hasMembership;
  // program.isPremium was previously admin-toggleable (Admin → Programs)
  // but never actually checked anywhere — the toggle showed a "Premium"
  // badge and did nothing else, so marking a program premium never
  // actually restricted access to it. Unlike `price` (a one-time purchase
  // alternative), isPremium means membership-only with no purchase bypass.
  const isMembershipLocked = programAccessLocked;

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
                  <span className="text-text-tertiary">
                    {/* Clamped: completedWorkouts can run past totalWorkouts once a
                        user trains beyond the program's last defined week (see
                        training/page.tsx's programFinished for why) — without this,
                        "remaining" could show as negative. */}
                    {Math.max(0, activeProgram.totalWorkouts - completedWorkouts)} remaining
                  </span>
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
              {/* Non-blocking acknowledgment — training more than once a day
                  is allowed, so this never hides the CTA below it. */}
              {workedOutToday && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-success/10 border border-success/30">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Day {Math.max(1, completedWorkouts)} complete
                  </span>
                  <button
                    onClick={() => router.push(`/training/session?programId=${program.id}&dow=${lastCompleted}`)}
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Repeat
                  </button>
                </div>
              )}
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
              ) : todayDay && !isRestToday ? (
                <Button fullWidth size="lg" onClick={() => router.push(`/training/session?programId=${program.id}&dow=${nextAbsIdx}`)}>
                  <Play className="w-5 h-5" /> Start — {stripWeekdayPrefix(todayDay.label ?? '')}
                </Button>
              ) : (
                <div className="p-4 bg-surface border border-white/8 rounded-2xl text-center">
                  <Moon className="w-5 h-5 text-text-tertiary mx-auto mb-1" />
                  <p className="text-sm text-text-secondary">Rest day</p>
                  <p className="text-xs text-text-tertiary mt-0.5">Recovery is part of the program too.</p>
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
                {hasMembership
                  ? "Your current plan doesn't include this program. Upgrade to unlock it."
                  : 'This program is included with an active membership. Subscribe to unlock it.'}
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
              {savedProgress
                ? `Resume — ${savedProgress.completedWorkouts} workouts done`
                : hasDifferentProgram ? 'Switch to This Program' : 'Start Program'}
            </Button>
          )}
        </motion.div>

        {/* Next Workout — hidden once the trial's day-limit is hit; the CTA
            above already explains the lock and offers to subscribe.
            Always the next not-yet-completed day, startable immediately
            regardless of whether the user already trained today. */}
        {isEnrolled && todayDay && !nextIsLocked && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <h2 className="text-base font-bold text-white mb-3">Next Workout</h2>
            <Card className={`p-4 ${isRestToday ? 'border-white/10' : 'border-accent/30'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {isRestToday ? <Moon className="w-4 h-4 text-text-tertiary" /> : <Dumbbell className="w-4 h-4 text-accent" />}
                  <span className="text-sm font-bold text-white">{stripWeekdayPrefix(todayDay.label)}</span>
                </div>
                {isRestToday ? (
                  <Button size="sm" variant="secondary" loading={skippingRest} onClick={handleSkipRest}>
                    Skip rest day
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => router.push(`/training/session?programId=${program.id}&dow=${nextAbsIdx}`)}>
                    <Play className="w-4 h-4" /> Start
                  </Button>
                )}
              </div>
              {isRestToday && (
                <p className="text-xs text-text-secondary">
                  Recovery day. Skip it to move on to {nextSession?.nextTraining ? stripWeekdayPrefix(nextSession.nextTraining.day.label) : 'the next session'}.
                </p>
              )}
              {!isRestToday && todayDay.exercises.length > 0 && (
                <div className="space-y-2 mt-2">
                  {todayDay.exercises.map((ex, i) => (
                    <div key={ex.id ?? i} className="flex items-center justify-between text-sm">
                      <CheckCircle className="w-3 h-3 flex-shrink-0 text-text-tertiary" />
                      <span className="flex-1 ml-2 text-text-secondary">{ex.name}</span>
                      <span className="text-text-tertiary text-xs">{ex.sets}×{ex.reps}</span>
                    </div>
                  ))}
                </div>
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
                      // nextAbsIdx always points at the next not-yet-done day now
                      // (see workedOutToday above), so anything before it —
                      // including "today"'s slot once nextAbsIdx has moved past
                      // it — is genuinely completed. No separate workedOutToday
                      // check needed here anymore.
                      const isPast = isEnrolled && absoluteDay < nextAbsIdx && !isToday;
                      const isCompleted = isPast && !day.isRest;
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
                            {/* Three columns: fixed day tile, flexible title,
                                fixed status. The status badge used to sit
                                INLINE after the title, so on a phone a
                                two-line title ("Legs (Quads, Hamstrings,
                                Glutes, Calves)") pushed "Today" hard up
                                against the row icon with no breathing room.
                                It now lives with the icon in its own
                                right-hand column, and the title column gets
                                min-w-0 so it wraps inside its own track
                                instead of shoving its neighbours. */}
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 flex-shrink-0 rounded-xl flex flex-col items-center justify-center text-xs font-bold ${
                                isCompleted ? 'bg-success/20 text-success' :
                                isToday ? 'bg-accent text-black' :
                                day.isRest ? 'bg-surface-elevated text-text-tertiary' :
                                'bg-surface-elevated text-white'
                              }`}>
                                {isCompleted
                                  ? <CheckCircle2 className="w-5 h-5" />
                                  : <span className="text-center leading-none">{`D${idx + 1}`}</span>
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${isCompleted ? 'text-success' : isToday ? 'text-white' : 'text-text-secondary'}`}>
                                  {stripWeekdayPrefix(day.label ?? '')}
                                </p>
                                {!day.isRest && (
                                  <p className="text-xs text-text-tertiary mt-0.5">{day.exercises.length} exercises</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {isLocked ? (
                                  <Badge variant="muted" className="inline-flex items-center gap-1 whitespace-nowrap">
                                    <Lock className="w-3 h-3" /> Members
                                  </Badge>
                                ) : (
                                  <>
                                    {isCompleted && <Badge variant="success">Done</Badge>}
                                    {!isCompleted && isToday && <Badge variant="accent">Today</Badge>}
                                    {!isCompleted && !isToday && isUpcoming && !day.isRest && <Badge variant="muted">Upcoming</Badge>}
                                    {day.isRest ? (
                                      <Moon className="w-4 h-4 text-text-tertiary" />
                                    ) : isCompleted ? (
                                      <CheckCircle2 className="w-4 h-4 text-success" />
                                    ) : (
                                      <Dumbbell className="w-4 h-4 text-text-tertiary" />
                                    )}
                                  </>
                                )}
                              </div>
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

      {/* Switch Program Modal — switching no longer destroys progress:
          enrollInProgram saves the outgoing program's position under
          programProgress[programId] and restores the target program's own
          saved position if it has one, so this is now a reassurance dialog
          rather than a destructive-action warning. */}
      <Modal open={switchModal} onClose={() => setSwitchModal(false)} title={`Switch to ${program.name}?`}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-accent/10 border border-accent/20 rounded-xl">
            <Save className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-text-secondary">
                Your <span className="text-white font-medium">{activeProgram?.programName}</span> progress
                ({activeProgram?.completedWorkouts ?? 0} workouts completed) will be saved.
                You can resume it anytime from My Programs.
                {savedProgress && (
                  <> You also have {savedProgress.completedWorkouts} workout{savedProgress.completedWorkouts === 1 ? '' : 's'} of saved progress on {program.name} — resume it, or start fresh.</>
                )}
              </p>
            </div>
          </div>
          {savedProgress ? (
            // A genuine choice only makes sense when there's actual saved
            // progress to choose between — "switching to test a program"
            // and coming back used to always silently resume old progress,
            // with no way to actually start clean if that's what you meant.
            <div className="space-y-2">
              <Button fullWidth loading={enrolling} onClick={() => handleEnroll(true, false)}>
                Resume — {savedProgress.completedWorkouts} workouts done
              </Button>
              <Button variant="ghost" fullWidth loading={enrolling} onClick={() => handleEnroll(true, true)}>
                Restart from Day 1
              </Button>
              <Button variant="ghost" fullWidth onClick={() => setSwitchModal(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button variant="ghost" fullWidth onClick={() => setSwitchModal(false)}>Cancel</Button>
              <Button fullWidth loading={enrolling} onClick={() => handleEnroll(true)}>
                Switch Program
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
