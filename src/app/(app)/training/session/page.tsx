'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle, Timer, AlertTriangle, ChevronLeft, ChevronRight,
  Copy, SkipForward, Plus, Minus, Dumbbell, Zap, Play, Pause, RotateCcw,
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
  isCardio: boolean;
  cardioDurationSeconds: number;
  sets: SetState[];
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_EXERCISES: Exercise[] = [
  { id: 'e1', name: 'Barbell Back Squat', sets: 4, reps: 5, restSeconds: 180, muscleGroup: 'legs' },
  { id: 'e2', name: 'Romanian Deadlift', sets: 3, reps: 8, restSeconds: 120, muscleGroup: 'hamstrings' },
  { id: 'e3', name: 'Leg Press', sets: 3, reps: 10, restSeconds: 90, muscleGroup: 'legs' },
  { id: 'e4', name: 'Leg Curl', sets: 3, reps: 12, restSeconds: 60, muscleGroup: 'hamstrings' },
];

const CARDIO_KEYWORDS = [
  'run', 'running', 'jog', 'jogging', 'sprint', 'walk', 'walking',
  'cardio', 'bike', 'biking', 'cycling', 'cycle', 'row', 'rowing',
  'swim', 'swimming', 'elliptical', 'treadmill', 'stair', 'hiit',
  'jump rope', 'skipping', 'rucking', 'ruck', 'hike', 'hiking',
];

function isCardioExercise(ex: Exercise): boolean {
  if (ex.isCardio) return true;
  const nameLower = ex.name.toLowerCase();
  return CARDIO_KEYWORDS.some((kw) => nameLower.includes(kw));
}

function buildExState(exercises: Exercise[]): ExState[] {
  return exercises.map((ex) => {
    const cardio = isCardioExercise(ex);
    const targetReps = typeof ex.reps === 'number' ? ex.reps : parseInt(String(ex.reps)) || 8;
    // For cardio, treat reps as minutes unless cardioDurationSeconds is explicitly set
    const cardioDuration = ex.cardioDurationSeconds ?? (targetReps * 60);
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
      isCardio: cardio,
      cardioDurationSeconds: cardioDuration,
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

// ─── Cardio Timer Row ────────────────────────────────────────────────────────

interface CardioTimerRowProps {
  setNum: number;
  durationSeconds: number;
  isActive: boolean;
  isPending: boolean;
  isCompleted: boolean;
  isSkipped: boolean;
  onActivate: () => void;
  onComplete: () => void;
  onSkip: () => void;
}

function CardioTimerRow({
  setNum, durationSeconds, isActive, isPending, isCompleted, isSkipped,
  onActivate, onComplete, onSkip,
}: CardioTimerRowProps) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const tickRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => clearInterval(tickRef.current);
  }, []);

  const remaining = Math.max(0, durationSeconds - elapsed);
  const pct = elapsed / durationSeconds;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const label = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
  const circumference = 2 * Math.PI * 22;

  function toggle() {
    if (running) {
      clearInterval(tickRef.current);
      setRunning(false);
    } else {
      setRunning(true);
      tickRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= durationSeconds) {
            clearInterval(tickRef.current);
            setRunning(false);
            return durationSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    }
  }

  function reset() {
    clearInterval(tickRef.current);
    setRunning(false);
    setElapsed(0);
  }

  if (isCompleted || isSkipped) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          isCompleted ? 'bg-success/5 border-success/20' : 'bg-white/3 border-white/6 opacity-40'
        }`}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isCompleted ? 'bg-success/20' : 'bg-white/8'
        }`}>
          {isCompleted ? <CheckCircle className="w-4 h-4 text-success" /> : <span className="text-xs text-text-tertiary">{setNum}</span>}
        </div>
        <div className="flex-1">
          <span className="text-sm text-text-secondary">Set {setNum}</span>
        </div>
        {isCompleted && <Timer className="w-4 h-4 text-success" />}
        {isSkipped && <span className="text-xs text-text-tertiary">Skipped</span>}
      </motion.div>
    );
  }

  if (isPending) {
    return (
      <motion.button
        layout
        onClick={onActivate}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-elevated transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-white/8 flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-text-tertiary font-bold">{setNum}</span>
        </div>
        <span className="text-sm text-text-secondary flex-1">Set {setNum}</span>
        <span className="text-xs text-text-tertiary">tap to activate</span>
      </motion.button>
    );
  }

  // Active cardio set — compact timer that fits on screen without scrolling
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-accent/40 bg-accent/5"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-accent/15">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
            <span className="text-xs font-black text-accent">{setNum}</span>
          </div>
          <span className="text-sm font-semibold text-foreground">Set {setNum} — Active</span>
        </div>
        <button
          onClick={onSkip}
          className="px-2.5 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-white hover:bg-white/8 transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Timer row — horizontal layout keeps height low */}
      <div className="flex items-center gap-4 px-4 py-4">
        {/* Compact circular ring */}
        <div className="relative flex-shrink-0">
          <svg width={72} height={72} className="-rotate-90">
            <circle cx={36} cy={36} r={30} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
            <motion.circle
              cx={36} cy={36} r={30} fill="none"
              stroke="#F5A623" strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 30}
              strokeDashoffset={2 * Math.PI * 30 * pct}
              transition={{ duration: 0.5 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Timer className="w-3.5 h-3.5 text-accent" />
          </div>
        </div>

        {/* Time display */}
        <div className="flex-1">
          <motion.p
            key={remaining}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="text-3xl font-black text-foreground leading-none tabular-nums"
          >
            {label}
          </motion.p>
          <p className="text-xs text-text-tertiary mt-1">
            {running ? 'Running…' : elapsed > 0 ? 'Paused' : 'Tap ▶ to start'}
          </p>
        </div>

        {/* Play/Pause + Reset */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={reset}
            className="w-9 h-9 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-text-secondary hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggle}
            className="w-12 h-12 rounded-full bg-accent flex items-center justify-center shadow-glow-sm active:scale-95 transition-all"
          >
            {running
              ? <Pause className="w-5 h-5 text-black" />
              : <Play className="w-5 h-5 text-black ml-0.5" />
            }
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-4 h-1 bg-white/8 rounded-full overflow-hidden mb-4">
        <motion.div
          className="h-full bg-accent rounded-full"
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Complete button — always visible */}
      <div className="px-4 pb-4">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onComplete}
          className="w-full py-3.5 rounded-xl bg-accent text-black font-bold text-sm flex items-center justify-center gap-2 shadow-glow-sm hover:bg-amber-400 transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          Done — Mark Complete
        </motion.button>
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
        onClick={isSkipped ? onActivate : undefined}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          isCompleted
            ? 'bg-success/5 border-success/20'
            : 'bg-white/3 border-white/6 opacity-40 cursor-pointer hover:opacity-60 hover:border-white/12 transition-opacity'
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
          <span className="text-xs text-text-tertiary">Skipped — tap to undo</span>
        )}
      </motion.div>
    );
  }

  if (isPending) {
    return (
      <motion.button
        layout
        onClick={onActivate}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-elevated transition-colors text-left"
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
          <span className="text-sm font-semibold text-foreground">Set {setNum} — Active</span>
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
            className="w-11 h-11 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-foreground hover:bg-border active:scale-95 transition-all"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="text-center w-16">
            <motion.p
              key={state.reps}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="text-4xl font-black text-foreground"
            >
              {state.reps}
            </motion.p>
            <p className="text-[10px] text-text-tertiary">reps</p>
          </div>
          <button
            onClick={() => onRepsChange(1)}
            className="w-11 h-11 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-foreground hover:bg-border active:scale-95 transition-all"
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
  const { user, profile, refreshProfile } = useAuth();
  const weightUnit = profile?.weightUnit ?? 'kg';

  const programId = searchParams.get('programId') ?? undefined;
  const dowParam = searchParams.get('dow');
  const dow = dowParam !== null ? parseInt(dowParam) : null;

  const sessionKey = `workout_session_${programId ?? 'free'}_${dow ?? 'x'}`;

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
    // Check sessionStorage first — instant restore with no network call
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (saved) {
        const { states, exIdx } = JSON.parse(saved) as { states: ExState[]; exIdx: number };
        if (states?.length) {
          setExStates(states);
          setCurrentExIdx(exIdx ?? 0);
          setLoadingProgram(false);
          return;
        }
      }
    } catch { /* ignore */ }

    const resolveExercises = async () => {
      let exercises: Exercise[] = DEFAULT_EXERCISES;

      if (programId) {
        try {
          const prog = await getProgram(programId);
          const mock = getMockProgram(programId);
          type AnyProgram = { schedule?: { isRest?: boolean; exercises?: Exercise[] }[]; exercises?: Exercise[] };

          if (dow !== null) {
            const firestoreProg = prog as AnyProgram | null;
            const schedule = firestoreProg?.schedule ?? (mock as AnyProgram | null)?.schedule ?? null;
            if (schedule?.length) {
              const dayPlan = schedule[dow % schedule.length];
              if (dayPlan && !dayPlan.isRest && dayPlan.exercises && dayPlan.exercises.length > 0) {
                exercises = dayPlan.exercises as Exercise[];
              }
            } else {
              const flat = firestoreProg?.exercises ?? (mock as AnyProgram | null)?.exercises ?? [];
              exercises = flat.length > 0 ? flat as Exercise[] : DEFAULT_EXERCISES;
            }
          } else {
            const firestoreProg = prog as AnyProgram | null;
            const flat = firestoreProg?.exercises ?? (mock as AnyProgram | null)?.exercises ?? [];
            exercises = flat.length > 0 ? flat as Exercise[] : DEFAULT_EXERCISES;
          }
        } catch {
          const mock = getMockProgram(programId);
          if (mock && dow !== null) {
            const dayPlan = getProgramDayForDow(mock, dow);
            exercises = (dayPlan && !dayPlan.isRest && dayPlan.exercises.length > 0)
              ? dayPlan.exercises
              : (mock.exercises.length > 0 ? mock.exercises : DEFAULT_EXERCISES);
          } else if (mock) {
            exercises = mock.exercises.length > 0 ? mock.exercises : DEFAULT_EXERCISES;
          }
        }
      }

      setExStates(buildExState(exercises));
      setLoadingProgram(false);
    };

    resolveExercises();
  }, [programId, dow, sessionKey]);

  // ── Persist session to sessionStorage ───────────────────────────────────

  useEffect(() => {
    if (exStates.length === 0) return;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({ states: exStates, exIdx: currentExIdx }));
    } catch { /* quota exceeded — ignore */ }
  }, [exStates, currentExIdx, sessionKey]);

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
  const allExercisesDone = exStates.length > 0 && exStates.every((e) =>
    e.sets.every((s) => s.status === 'completed' || s.status === 'skipped'),
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
          // Allow activating pending OR skipped sets
          if (i === setIdx && (s.status === 'pending' || s.status === 'skipped')) return { ...s, status: 'active' as SetStatus };
          // Demote any currently-active set back to pending when unskipping
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

      const advanceToNext = () => {
        setCurrentExIdx(exIdx + 1);
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

      if (allDone) {
        const isLastEx = exIdx === exStates.length - 1;
        if (ex.isCardio) {
          // Cardio: no rest timer, short delay then continue
          setTimeout(() => {
            if (isLastEx) {
              setCompleteModal(true);
            } else {
              advanceToNext();
            }
          }, 1200);
        } else if (isLastEx) {
          startRest(ex.restSeconds);
          setTimeout(() => {
            stopRest();
            setCompleteModal(true);
          }, 1200);
        } else {
          startRest(ex.restSeconds);
          const advanceTimer = setTimeout(advanceToNext, ex.restSeconds * 1000);
          (window as Window & { __advanceTimer?: NodeJS.Timeout }).__advanceTimer = advanceTimer;
        }
      } else if (!ex.isCardio) {
        // Non-cardio: start rest between sets
        startRest(ex.restSeconds);
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
      const result = await completeWorkout(user.uid, logs, duration, programId, dow ?? undefined);
      sessionStorage.removeItem(sessionKey);
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
                    {currentEx.isCardio
                      ? `${currentEx.targetSets} sets · ${Math.floor(currentEx.cardioDurationSeconds / 60)}:${String(currentEx.cardioDurationSeconds % 60).padStart(2, '0')} each`
                      : `${currentEx.targetSets} sets × ${currentEx.targetReps} reps${currentEx.restSeconds > 0 ? ` · ${currentEx.restSeconds}s rest` : ''}`
                    }
                  </p>
                </div>
              </div>

              {/* Set rows */}
              <div className="space-y-2 mt-3">
                {currentEx.sets.map((setState, si) => (
                  currentEx.isCardio ? (
                    <CardioTimerRow
                      key={si}
                      setNum={si + 1}
                      durationSeconds={currentEx.cardioDurationSeconds}
                      isActive={setState.status === 'active'}
                      isPending={setState.status === 'pending'}
                      isCompleted={setState.status === 'completed'}
                      isSkipped={setState.status === 'skipped'}
                      onActivate={() => activateSet(currentExIdx, si)}
                      onComplete={() => completeSet(currentExIdx, si)}
                      onSkip={() => skipSet(currentExIdx, si)}
                    />
                  ) : (
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
                  )
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Finish Workout button (shown when all sets done) ─────────── */}
      {allExercisesDone && !completeModal && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-lg mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Button fullWidth size="lg" onClick={() => setCompleteModal(true)}>
              <CheckCircle className="w-5 h-5" /> Finish Workout
            </Button>
          </motion.div>
        </div>
      )}

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
            <Button variant="danger" fullWidth onClick={() => { sessionStorage.removeItem(sessionKey); router.replace('/training'); }}>Quit</Button>
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
            onContinue={() => { refreshProfile().catch(() => {}); router.replace('/dashboard'); }}
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
