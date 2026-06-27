'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle, Timer, AlertTriangle, ChevronLeft, ChevronRight,
  Copy, SkipForward, Plus, Minus, Dumbbell, Zap,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getProgram } from '@/lib/firestore';
import { getMockProgram, getProgramDayForDow } from '@/lib/programs';
import { completeWorkout } from '@/lib/actions';
import { WorkoutShareCard } from '@/components/workout/WorkoutShareCard';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { WeightWheel } from '@/components/workout/WeightWheel';
import type { Exercise } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────

type SetStatus = 'pending' | 'active' | 'completed' | 'skipped';

interface SetState {
  weight: number;
  reps: number;
  status: SetStatus;
}

interface ExState {
  id: string;
  name: string;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
  muscleGroup?: string;
  sets: SetState[];
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_EXERCISES: Exercise[] = [
  { id: 'e1', name: 'Barbell Back Squat', sets: 4, reps: 5, restSeconds: 180, muscleGroup: 'legs' },
  { id: 'e2', name: 'Romanian Deadlift', sets: 3, reps: 8, restSeconds: 120, muscleGroup: 'hamstrings' },
  { id: 'e3', name: 'Leg Press', sets: 3, reps: 10, restSeconds: 90, muscleGroup: 'legs' },
  { id: 'e4', name: 'Leg Curl', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'hamstrings' },
];

function buildExState(exercises: Exercise[]): ExState[] {
  return exercises.map((ex) => {
    const targetReps = typeof ex.reps === 'number' ? ex.reps : parseInt(String(ex.reps)) || 8;
    const sets: SetState[] = Array.from({ length: ex.sets }, (_, i) => ({
      weight: 0,
      reps: targetReps,
      status: i === 0 ? 'active' : 'pending',
    }));
    return {
      id: ex.id,
      name: ex.name,
      targetSets: ex.sets,
      targetReps,
      restSeconds: ex.restSeconds ?? 90,
      muscleGroup: ex.muscleGroup,
      sets,
    };
  });
}

// ─── Rest Timer Pill ─────────────────────────────────────────────────────────

interface RestPillProps {
  seconds: number;
  total: number;
  onSkip: () => void;
  onExtend: () => void;
}

function RestPill({ seconds, total, onSkip, onExtend }: RestPillProps) {
  const pct = Math.max(0, seconds / total);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const label = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 80, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 80, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className="fixed bottom-24 left-4 right-4 z-50 max-w-lg mx-auto"
    >
      <div className="bg-surface-elevated border border-white/12 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center gap-4">
          {/* Circular timer */}
          <div className="relative flex-shrink-0">
            <svg width={52} height={52} className="-rotate-90">
              <circle cx={26} cy={26} r={22} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
              <motion.circle
                cx={26} cy={26} r={22} fill="none"
                stroke="#F5A623" strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - pct)}
                transition={{ duration: 0.5 }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <Timer className="w-4 h-4 text-accent" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">Rest</p>
            <motion.p
              key={seconds}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-black text-white leading-none"
            >
              {label}
            </motion.p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExtend}
              className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center text-text-secondary hover:text-white hover:bg-white/15 transition-colors"
              title="+30s"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onSkip}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent/15 border border-accent/30 text-accent text-sm font-semibold hover:bg-accent/25 transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/8 rounded-full mt-3 overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-full"
            animate={{ width: `${pct * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Set Row ─────────────────────────────────────────────────────────────────

interface SetRowProps {
  setNum: number;
  state: SetState;
  isActive: boolean;
  weightUnit: string;
  onActivate: () => void;
  onWeightChange: (v: number) => void;
  onRepsChange: (delta: number) => void;
  onComplete: () => void;
  onSkip: () => void;
  onDuplicate: () => void;
}

function SetRow({
  setNum, state, isActive, weightUnit,
  onActivate, onWeightChange, onRepsChange, onComplete, onSkip, onDuplicate,
}: SetRowProps) {
  const isCompleted = state.status === 'completed';
  const isSkipped = state.status === 'skipped';
  const isPending = state.status === 'pending';

  if (isCompleted || isSkipped) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          isCompleted
            ? 'bg-success/5 border-success/20'
            : 'bg-white/3 border-white/6 opacity-40'
        }`}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isCompleted ? 'bg-success/20' : 'bg-white/8'
        }`}>
          {isCompleted ? (
            <CheckCircle className="w-4 h-4 text-success" />
          ) : (
            <span className="text-xs text-text-tertiary">{setNum}</span>
          )}
        </div>
        <div className="flex-1">
          <span className="text-sm text-text-secondary">Set {setNum}</span>
        </div>
        {isCompleted && (
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <span>{state.weight}{weightUnit}</span>
            <span className="text-text-tertiary">×</span>
            <span>{state.reps} reps</span>
          </div>
        )}
        {isSkipped && (
          <span className="text-xs text-text-tertiary">Skipped</span>
        )}
      </motion.div>
    );
  }

  if (isPending) {
    return (
      <motion.button
        layout
        onClick={onActivate}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/6 bg-white/3 hover:border-white/12 hover:bg-white/5 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-white/8 flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-text-tertiary font-bold">{setNum}</span>
        </div>
        <span className="text-sm text-text-secondary flex-1">Set {setNum}</span>
        <span className="text-xs text-text-tertiary">tap to activate</span>
      </motion.button>
    );
  }

  // Active set — full weight wheel + reps control
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-accent/40 bg-accent/5 overflow-hidden"
    >
      {/* Set header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-accent/15">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
            <span className="text-xs font-black text-accent">{setNum}</span>
          </div>
          <span className="text-sm font-semibold text-white">Set {setNum} — Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onDuplicate}
            title="Copy previous set"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-white hover:bg-white/8 transition-colors"
          >
            <Copy className="w-3 h-3" />
            Copy
          </button>
          <button
            onClick={onSkip}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-white hover:bg-white/8 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>

      {/* Weight wheel */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-widest text-center mb-2">
          Weight ({weightUnit.toUpperCase()})
        </p>
        <WeightWheel
          value={state.weight}
          onChange={onWeightChange}
          step={weightUnit === 'lbs' ? 5 : 2.5}
          max={weightUnit === 'lbs' ? 660 : 300}
          unit={weightUnit}
        />
      </div>

      {/* Reps */}
      <div className="px-4 pb-4">
        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-widest text-center mb-3">
          Reps Completed
        </p>
        <div className="flex items-center justify-center gap-5">
          <button
            onClick={() => onRepsChange(-1)}
            className="w-11 h-11 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white hover:bg-white/15 active:scale-95 transition-all"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="text-center w-16">
            <motion.p
              key={state.reps}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="text-4xl font-black text-white"
            >
              {state.reps}
            </motion.p>
            <p className="text-[10px] text-text-tertiary">reps</p>
          </div>
          <button
            onClick={() => onRepsChange(1)}
            className="w-11 h-11 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white hover:bg-white/15 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Complete button */}
      <div className="px-4 pb-4">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onComplete}
          className="w-full py-3.5 rounded-xl bg-accent text-black font-bold text-sm flex items-center justify-center gap-2 shadow-glow-sm hover:bg-amber-400 transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          Complete Set {setNum}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function WorkoutSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const weightUnit = profile?.weightUnit ?? 'kg';

  const programId = searchParams.get('programId') ?? undefined;
  const dowParam = searchParams.get('dow');
  const dow = dowParam !== null ? parseInt(dowParam) : null;

  const [exStates, setExStates] = useState<ExState[]>([]);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [loadingProgram, setLoadingProgram] = useState(true);

  // Rest timer
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(90);
  const restRef = useRef<NodeJS.Timeout>();

  // Modals
  const [quitModal, setQuitModal] = useState(false);
  const [completeModal, setCompleteModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [startTime] = useState(Date.now());
  const [workoutResult, setWorkoutResult] = useState<{
    duration: number; xpEarned: number; newPowerLevel: number; newAchievements: string[];
  } | null>(null);

  // ── Load program ────────────────────────────────────────────────────────

  useEffect(() => {
    const resolveExercises = async () => {
      let exercises: Exercise[] = DEFAULT_EXERCISES;

      if (programId) {
        try {
          const prog = await getProgram(programId);
          const mock = getMockProgram(programId);

          // Prefer day-specific exercises when dow is given
          if (mock && dow !== null) {
            const dayPlan = getProgramDayForDow(mock, dow);
            if (dayPlan && !dayPlan.isRest && dayPlan.exercises.length > 0) {
              exercises = dayPlan.exercises;
            } else if (mock.exercises.length > 0) {
              exercises = mock.exercises;
            }
          } else if (prog && (prog as unknown as { exercises?: Exercise[] }).exercises?.length) {
            exercises = (prog as unknown as { exercises: Exercise[] }).exercises;
          } else if (mock) {
            exercises = mock.exercises.length > 0 ? mock.exercises : DEFAULT_EXERCISES;
          }
        } catch {
          const mock = getMockProgram(programId);
          if (mock) {
            const dayPlan = dow !== null ? getProgramDayForDow(mock, dow) : null;
            exercises = (dayPlan && !dayPlan.isRest && dayPlan.exercises.length > 0)
              ? dayPlan.exercises
              : (mock.exercises.length > 0 ? mock.exercises : DEFAULT_EXERCISES);
          }
        }
      }

      setExStates(buildExState(exercises));
      setLoadingProgram(false);
    };

    resolveExercises();
  }, [programId, dow]);

  // ── Rest timer tick ─────────────────────────────────────────────────────

  const stopRest = useCallback(() => {
    clearInterval(restRef.current);
    setRestSeconds(null);
  }, []);

  const startRest = useCallback((seconds: number) => {
    clearInterval(restRef.current);
    setRestTotal(seconds);
    setRestSeconds(seconds);
    restRef.current = setInterval(() => {
      setRestSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(restRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => clearInterval(restRef.current), []);

  // ── Derived state ───────────────────────────────────────────────────────

  const currentEx = exStates[currentExIdx];

  const totalSets = exStates.reduce((s, e) => s + e.targetSets, 0);
  const completedSets = exStates.reduce(
    (s, e) => s + e.sets.filter((st) => st.status === 'completed').length,
    0,
  );

  // ── Mutators ────────────────────────────────────────────────────────────

  const updateSet = useCallback(
    (exIdx: number, setIdx: number, patch: Partial<SetState>) => {
      setExStates((prev) => {
        const next = [...prev];
        const ex = { ...next[exIdx], sets: [...next[exIdx].sets] };
        ex.sets[setIdx] = { ...ex.sets[setIdx], ...patch };
        next[exIdx] = ex;
        return next;
      });
    },
    [],
  );

  const activateSet = useCallback(
    (exIdx: number, setIdx: number) => {
      setExStates((prev) => {
        const next = [...prev];
        const ex = { ...next[exIdx], sets: next[exIdx].sets.map((s, i) => {
          if (i === setIdx && s.status === 'pending') return { ...s, status: 'active' as SetStatus };
          if (s.status === 'active') return { ...s, status: 'pending' as SetStatus };
          return s;
        })};
        next[exIdx] = ex;
        return next;
      });
    },
    [],
  );

  const completeSet = useCallback(
    (exIdx: number, setIdx: number) => {
      stopRest();

      setExStates((prev) => {
        const next = [...prev];
        const ex = { ...next[exIdx], sets: [...next[exIdx].sets] };
        // Mark this set completed
        ex.sets[setIdx] = { ...ex.sets[setIdx], status: 'completed' };

        // Find next pending set in this exercise
        const nextSetIdx = ex.sets.findIndex((s, i) => i > setIdx && s.status === 'pending');
        if (nextSetIdx !== -1) {
          ex.sets[nextSetIdx] = { ...ex.sets[nextSetIdx], status: 'active' };
        }

        next[exIdx] = ex;
        return next;
      });

      // Determine if all sets in this exercise are done
      const ex = exStates[exIdx];
      const allDone = ex.sets.every((s, i) =>
        i === setIdx ? true : s.status === 'completed' || s.status === 'skipped',
      );

      // Start rest timer
      startRest(ex.restSeconds);

      if (allDone) {
        // Last exercise?
        const isLastEx = exIdx === exStates.length - 1;
        if (isLastEx) {
          // Small delay so timer is seen briefly then complete modal
          setTimeout(() => {
            stopRest();
            setCompleteModal(true);
          }, 1200);
        } else {
          // Advance to next exercise after rest
          const autoAdvance = () => {
            setCurrentExIdx(exIdx + 1);
            // Mark first set of next exercise as active
            setExStates((prev) => {
              const next = [...prev];
              const nextEx = { ...next[exIdx + 1], sets: [...next[exIdx + 1].sets] };
              if (nextEx.sets[0].status === 'pending') {
                nextEx.sets[0] = { ...nextEx.sets[0], status: 'active' };
              }
              next[exIdx + 1] = nextEx;
              return next;
            });
          };
          // Auto-advance after rest (will be cancelled if user skips)
          const advanceTimer = setTimeout(autoAdvance, ex.restSeconds * 1000);
          // Store so skip can cancel it — we use the stopRest side-effect pattern:
          // when user skips rest we call stopRest + manual advance
          (window as Window & { __advanceTimer?: NodeJS.Timeout }).__advanceTimer = advanceTimer;
        }
      }
    },
    [exStates, startRest, stopRest],
  );

  const skipRest = useCallback(() => {
    stopRest();
    clearTimeout((window as Window & { __advanceTimer?: NodeJS.Timeout }).__advanceTimer);
    // If all sets in current exercise done, advance to next
    if (currentEx) {
      const allDone = currentEx.sets.every((s) =>
        s.status === 'completed' || s.status === 'skipped',
      );
      if (allDone && currentExIdx < exStates.length - 1) {
        setCurrentExIdx((i) => i + 1);
        setExStates((prev) => {
          const next = [...prev];
          const nextEx = { ...next[currentExIdx + 1], sets: [...next[currentExIdx + 1].sets] };
          if (nextEx.sets[0].status === 'pending') {
            nextEx.sets[0] = { ...nextEx.sets[0], status: 'active' };
          }
          next[currentExIdx + 1] = nextEx;
          return next;
        });
      }
    }
  }, [currentEx, currentExIdx, exStates.length, stopRest]);

  const skipSet = useCallback(
    (exIdx: number, setIdx: number) => {
      setExStates((prev) => {
        const next = [...prev];
        const ex = { ...next[exIdx], sets: [...next[exIdx].sets] };
        ex.sets[setIdx] = { ...ex.sets[setIdx], status: 'skipped' };
        const nextSetIdx = ex.sets.findIndex((s, i) => i > setIdx && s.status === 'pending');
        if (nextSetIdx !== -1) {
          ex.sets[nextSetIdx] = { ...ex.sets[nextSetIdx], status: 'active' };
        }
        next[exIdx] = ex;
        return next;
      });
    },
    [],
  );

  const duplicatePrevSet = useCallback(
    (exIdx: number, setIdx: number) => {
      if (setIdx === 0) return;
      const prev = exStates[exIdx]?.sets[setIdx - 1];
      if (!prev) return;
      updateSet(exIdx, setIdx, { weight: prev.weight, reps: prev.reps });
    },
    [exStates, updateSet],
  );

  // ── Save workout ────────────────────────────────────────────────────────

  const saveWorkout = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const duration = Math.round((Date.now() - startTime) / 60000) || 1;
      const logs = exStates.map((ex) => ({
        name: ex.name,
        sets: ex.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          completed: s.status === 'completed',
        })),
      }));
      const result = await completeWorkout(user.uid, logs, duration, programId);
      setSaved(true);
      setWorkoutResult({ duration, ...result });
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      toast.error(`Failed to save: ${e?.message || String(err)}`, { duration: 8000 });
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (loadingProgram) {
    return (
      <div className="min-h-screen bg-background flex flex-col px-4 py-8 gap-4 items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        >
          <Dumbbell className="w-8 h-8 text-accent" />
        </motion.div>
        <p className="text-text-secondary text-sm">Loading workout…</p>
      </div>
    );
  }

  if (!currentEx) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-white/8">
        <div className="px-4 py-3 max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setQuitModal(true)}
              className="p-2 rounded-xl text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center flex-1 px-4">
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentEx.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="text-sm font-bold text-white truncate"
                >
                  {currentEx.name}
                </motion.p>
              </AnimatePresence>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                Exercise {currentExIdx + 1} of {exStates.length}
                {currentEx.muscleGroup && ` · ${currentEx.muscleGroup}`}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs text-text-secondary font-mono">
                {completedSets}/{totalSets}
              </p>
              <p className="text-[10px] text-text-tertiary">sets</p>
            </div>
          </div>
          <ProgressBar value={completedSets} max={totalSets} size="sm" />
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-40">
        <div className="px-4 py-4 max-w-lg mx-auto space-y-3">
          {/* Exercise title card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentEx.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <div className="flex items-center gap-3 px-1 mb-1">
                <div className="p-2 rounded-xl bg-accent-muted">
                  <Zap className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-tight">{currentEx.name}</h2>
                  <p className="text-xs text-text-secondary">
                    {currentEx.targetSets} sets × {currentEx.targetReps} reps
                    {currentEx.restSeconds > 0 && ` · ${currentEx.restSeconds}s rest`}
                  </p>
                </div>
              </div>

              {/* Set rows */}
              <div className="space-y-2 mt-3">
                {currentEx.sets.map((setState, si) => (
                  <SetRow
                    key={si}
                    setNum={si + 1}
                    state={setState}
                    isActive={setState.status === 'active'}
                    weightUnit={weightUnit}
                    onActivate={() => activateSet(currentExIdx, si)}
                    onWeightChange={(v) => updateSet(currentExIdx, si, { weight: v })}
                    onRepsChange={(delta) =>
                      updateSet(currentExIdx, si, {
                        reps: Math.max(1, setState.reps + delta),
                      })
                    }
                    onComplete={() => completeSet(currentExIdx, si)}
                    onSkip={() => skipSet(currentExIdx, si)}
                    onDuplicate={() => duplicatePrevSet(currentExIdx, si)}
                  />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Exercise nav ──────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-xl border-t border-white/8 pb-safe">
        <div className="px-4 py-3 max-w-lg mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentExIdx === 0}
            onClick={() => setCurrentExIdx((i) => i - 1)}
            className="flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex gap-1.5 flex-1 justify-center">
            {exStates.map((ex, i) => {
              const allDone = ex.sets.every((s) =>
                s.status === 'completed' || s.status === 'skipped',
              );
              return (
                <button
                  key={i}
                  onClick={() => setCurrentExIdx(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === currentExIdx
                      ? 'bg-accent w-6'
                      : allDone
                      ? 'bg-success/60 w-3'
                      : 'bg-white/20 w-3'
                  }`}
                />
              );
            })}
          </div>

          <Button
            variant="ghost"
            size="sm"
            disabled={currentExIdx === exStates.length - 1}
            onClick={() => setCurrentExIdx((i) => i + 1)}
            className="flex-shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Rest Timer Pill ───────────────────────────────────────────── */}
      <AnimatePresence>
        {restSeconds !== null && (
          <RestPill
            seconds={restSeconds}
            total={restTotal}
            onSkip={skipRest}
            onExtend={() => setRestSeconds((s) => (s ?? 0) + 30)}
          />
        )}
      </AnimatePresence>

      {/* ── Quit Modal ────────────────────────────────────────────────── */}
      <Modal open={quitModal} onClose={() => setQuitModal(false)} title="Quit Workout?">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-danger/10 border border-danger/20 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">
              You&apos;ve completed {completedSets} of {totalSets} sets. Quit without saving?
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setQuitModal(false)}>Continue</Button>
            <Button variant="danger" fullWidth onClick={() => router.replace('/training')}>Quit</Button>
          </div>
        </div>
      </Modal>

      {/* ── Complete Modal ────────────────────────────────────────────── */}
      <Modal open={completeModal} onClose={() => !saving && setCompleteModal(false)} title={saved ? '🎉 Saved!' : 'Workout Complete!'}>
        {saved && workoutResult ? (
          <WorkoutShareCard
            duration={workoutResult.duration}
            completedSets={completedSets}
            exerciseCount={exStates.length}
            xpEarned={workoutResult.xpEarned}
            newPowerLevel={workoutResult.newPowerLevel}
            streak={profile?.statsCache?.streak ?? profile?.stats?.streak ?? 0}
            newAchievements={workoutResult.newAchievements}
            onContinue={() => router.replace('/dashboard')}
          />
        ) : (
          <div className="space-y-4">
            <div className="text-center py-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
              >
                <CheckCircle className="w-16 h-16 text-success mx-auto mb-3" />
              </motion.div>
              <p className="text-2xl font-black text-white">Workout Complete!</p>
              <p className="text-text-secondary text-sm mt-1">
                {completedSets} sets completed · {Math.round((Date.now() - startTime) / 60000)} min
              </p>
            </div>
            <Button fullWidth size="lg" loading={saving} onClick={saveWorkout}>
              Save Workout
            </Button>
            <Button variant="ghost" fullWidth onClick={() => router.replace('/dashboard')}>
              Skip Save
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
