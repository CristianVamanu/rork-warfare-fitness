'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, CheckCircle, Timer, AlertTriangle, Plus, Minus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getProgram } from '@/lib/firestore';
import { completeWorkout } from '@/lib/actions';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Exercise } from '@/types';

// Default exercises used when no Firestore program is available
const DEFAULT_EXERCISES = [
  { id: 'e1', name: 'Barbell Back Squat', sets: 4, reps: 5, restSeconds: 180, maxWeight: 300 },
  { id: 'e2', name: 'Romanian Deadlift', sets: 3, reps: 8, restSeconds: 120, maxWeight: 250 },
  { id: 'e3', name: 'Leg Press', sets: 3, reps: 10, restSeconds: 90, maxWeight: 400 },
  { id: 'e4', name: 'Leg Curl', sets: 3, reps: 12, restSeconds: 60, maxWeight: 100 },
];

interface SessionExercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  restSeconds: number;
  maxWeight: number;
}

interface SetLog { weight: number; reps: number; completed: boolean }
interface ExerciseLog { name: string; sets: SetLog[] }

function buildSessionExercises(exercises: Exercise[]): SessionExercise[] {
  return exercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    sets: ex.sets,
    reps: typeof ex.reps === 'number' ? ex.reps : parseInt(String(ex.reps)) || 8,
    restSeconds: ex.restSeconds ?? 90,
    maxWeight: 500, // anti-cheat max — Exercise type has no maxWeight field
  }));
}

export default function WorkoutSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const weightUnit = profile?.weightUnit ?? 'kg';
  const programId = searchParams.get('programId') ?? undefined;

  const [exercises, setExercises] = useState<SessionExercise[]>(DEFAULT_EXERCISES);
  const [loadingProgram, setLoadingProgram] = useState(!!programId);

  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [currentSetIdx, setCurrentSetIdx] = useState(0);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restInterval, setRestInterval] = useState<NodeJS.Timeout | null>(null);
  const [quitModal, setQuitModal] = useState(false);
  const [completeModal, setCompleteModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startTime] = useState(Date.now());
  const [editingWeight, setEditingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState('');

  // Load program from Firestore when programId is provided
  useEffect(() => {
    if (!programId) {
      setExercises(DEFAULT_EXERCISES);
      setLoadingProgram(false);
      return;
    }
    getProgram(programId)
      .then((program) => {
        const prog = program as ({ id: string; exercises?: Exercise[] }) | null;
        if (prog && prog.exercises && prog.exercises.length > 0) {
          setExercises(buildSessionExercises(prog.exercises!));
        } else {
          console.warn('[Session] Program has no exercises — using defaults');
          setExercises(DEFAULT_EXERCISES);
        }
      })
      .catch((err) => {
        console.error('[Session] Failed to load program:', err);
        toast.error('Could not load program — using default exercises');
        setExercises(DEFAULT_EXERCISES);
      })
      .finally(() => setLoadingProgram(false));
  }, [programId]);

  // Rebuild logs whenever exercises change (program loaded)
  useEffect(() => {
    setLogs(
      exercises.map((ex) => ({
        name: ex.name,
        sets: Array.from({ length: ex.sets }, () => ({
          weight: 0,
          reps: ex.reps,
          completed: false,
        })),
      }))
    );
    setCurrentExIdx(0);
    setCurrentSetIdx(0);
  }, [exercises]);

  const currentEx = exercises[currentExIdx];
  const currentLog = logs[currentExIdx];
  const currentSet = currentLog?.sets[currentSetIdx];
  const totalSets = exercises.reduce((s, e) => s + e.sets, 0);
  const completedSets = logs.reduce((s, l) => s + l.sets.filter((st) => st.completed).length, 0);

  const startRestTimer = useCallback((seconds: number) => {
    setRestTimer(seconds);
    const interval = setInterval(() => {
      setRestTimer((t) => {
        if (t === null || t <= 1) { clearInterval(interval); return null; }
        return t - 1;
      });
    }, 1000);
    setRestInterval(interval);
  }, []);

  useEffect(() => () => { if (restInterval) clearInterval(restInterval); }, [restInterval]);

  const updateSet = (field: 'weight' | 'reps', delta: number) => {
    setLogs((prev) => {
      const next = [...prev];
      const set = { ...next[currentExIdx].sets[currentSetIdx] };
      const val = Math.max(0, set[field] + delta);
      if (field === 'weight' && val > currentEx.maxWeight) {
        toast.error(`Max weight is ${currentEx.maxWeight}${weightUnit}`);
        return prev;
      }
      set[field] = val;
      next[currentExIdx] = {
        ...next[currentExIdx],
        sets: next[currentExIdx].sets.map((s, i) => (i === currentSetIdx ? set : s)),
      };
      return next;
    });
  };

  const commitWeightInput = () => {
    const parsed = parseFloat(weightInput);
    if (!isNaN(parsed) && parsed >= 0) {
      const clamped = Math.min(parsed, currentEx.maxWeight);
      if (clamped !== parsed) toast.error(`Max weight is ${currentEx.maxWeight}${weightUnit}`);
      setLogs((prev) => {
        const next = [...prev];
        const sets = next[currentExIdx].sets.map((s, i) =>
          i === currentSetIdx ? { ...s, weight: clamped } : s
        );
        next[currentExIdx] = { ...next[currentExIdx], sets };
        return next;
      });
    }
    setEditingWeight(false);
  };

  const completeSet = () => {
    setLogs((prev) => {
      const next = [...prev];
      next[currentExIdx] = {
        ...next[currentExIdx],
        sets: next[currentExIdx].sets.map((s, i) =>
          i === currentSetIdx ? { ...s, completed: true } : s
        ),
      };
      return next;
    });

    const isLastSet = currentSetIdx === currentEx.sets - 1;
    const isLastEx = currentExIdx === exercises.length - 1;

    if (isLastSet && isLastEx) { setCompleteModal(true); return; }

    setEditingWeight(false);
    startRestTimer(currentEx.restSeconds);
    if (isLastSet) { setCurrentExIdx((i) => i + 1); setCurrentSetIdx(0); }
    else { setCurrentSetIdx((s) => s + 1); }
  };

  const saveWorkout = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const duration = Math.round((Date.now() - startTime) / 60000);
      await completeWorkout(user.uid, logs, duration, programId);
      toast.success('Workout saved!');
      router.replace('/dashboard');
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      const display = e?.code ? `${e.code}: ${e.message}` : (e?.message || String(err));
      toast.error(`Failed to save workout: ${display}`, { duration: 8000 });
      setSaving(false);
    }
  };

  if (loadingProgram) {
    return (
      <div className="min-h-screen bg-background flex flex-col px-4 py-8 gap-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    );
  }

  if (!currentEx || !currentLog) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Session Header */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setQuitModal(true)} className="p-2 rounded-xl text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-xs text-text-secondary">Exercise {currentExIdx + 1} of {exercises.length}</p>
            <p className="text-sm font-bold text-white">{currentEx.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-secondary">Set</p>
            <p className="text-sm font-bold text-white">{currentSetIdx + 1}/{currentEx.sets}</p>
          </div>
        </div>
        <ProgressBar value={completedSets} max={totalSets} size="sm" />
      </div>

      <div className="flex-1 px-4 py-6 flex flex-col gap-6 max-w-lg mx-auto w-full">
        {/* Rest Timer */}
        <AnimatePresence>
          {restTimer !== null && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <Card glass className="p-4 text-center">
                <Timer className="w-5 h-5 text-accent mx-auto mb-1" />
                <p className="text-xs text-text-secondary mb-1">Rest Time</p>
                <p className="text-3xl font-black text-accent">{restTimer}s</p>
                <button
                  onClick={() => { setRestTimer(null); if (restInterval) clearInterval(restInterval); }}
                  className="text-xs text-text-secondary mt-2 hover:text-white"
                >
                  Skip rest
                </button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Exercise Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentExIdx}-${currentSetIdx}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
          >
            <Card className="p-6 space-y-6">
              <div className="text-center">
                <p className="text-4xl font-black text-white">{currentEx.name}</p>
                <p className="text-text-secondary text-sm mt-1">Target: {currentEx.reps} reps</p>
              </div>

              {/* Weight Control */}
              <div>
                <p className="text-xs text-text-secondary text-center mb-3">WEIGHT ({weightUnit.toUpperCase()})</p>
                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={() => updateSet('weight', -2.5)}
                    className="w-12 h-12 rounded-full bg-surface-elevated border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="text-center" onClick={() => {
                    if (!editingWeight) {
                      setWeightInput(String(currentSet?.weight || 0));
                      setEditingWeight(true);
                    }
                  }}>
                    {editingWeight ? (
                      <input
                        autoFocus
                        type="number"
                        inputMode="decimal"
                        value={weightInput}
                        onChange={(e) => setWeightInput(e.target.value)}
                        onBlur={commitWeightInput}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitWeightInput(); if (e.key === 'Escape') setEditingWeight(false); }}
                        className="w-24 text-5xl font-black text-white text-center bg-transparent border-b-2 border-accent focus:outline-none"
                      />
                    ) : (
                      <p className="text-5xl font-black text-white w-24 text-center cursor-pointer">{currentSet?.weight || 0}</p>
                    )}
                    <p className="text-xs text-text-tertiary">{editingWeight ? 'tap Enter' : `${weightUnit} — tap to edit`}</p>
                  </div>
                  <button
                    onClick={() => updateSet('weight', 2.5)}
                    className="w-12 h-12 rounded-full bg-surface-elevated border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Reps Control */}
              <div>
                <p className="text-xs text-text-secondary text-center mb-3">REPS COMPLETED</p>
                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={() => updateSet('reps', -1)}
                    className="w-12 h-12 rounded-full bg-surface-elevated border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="text-center">
                    <p className="text-5xl font-black text-white w-24 text-center">{currentSet?.reps || 0}</p>
                    <p className="text-xs text-text-tertiary">reps</p>
                  </div>
                  <button
                    onClick={() => updateSet('reps', 1)}
                    className="w-12 h-12 rounded-full bg-surface-elevated border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Set indicators */}
              <div className="flex gap-2 justify-center">
                {currentLog.sets.map((s, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                      s.completed ? 'bg-success text-white' :
                      i === currentSetIdx ? 'bg-accent text-black' :
                      'bg-surface-elevated text-text-tertiary'
                    }`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>

        <Button fullWidth size="lg" onClick={completeSet}>
          <CheckCircle className="w-5 h-5" /> Complete Set
        </Button>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button
            variant="ghost"
            fullWidth
            disabled={currentExIdx === 0 && currentSetIdx === 0}
            onClick={() => {
              if (currentSetIdx > 0) setCurrentSetIdx((s) => s - 1);
              else if (currentExIdx > 0) { setCurrentExIdx((i) => i - 1); setCurrentSetIdx(exercises[currentExIdx - 1].sets - 1); }
            }}
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              const isLastSet = currentSetIdx === currentEx.sets - 1;
              const isLastEx = currentExIdx === exercises.length - 1;
              if (isLastSet && isLastEx) setCompleteModal(true);
              else if (isLastSet) { setCurrentExIdx((i) => i + 1); setCurrentSetIdx(0); }
              else setCurrentSetIdx((s) => s + 1);
            }}
          >
            Skip <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Quit Modal */}
      <Modal open={quitModal} onClose={() => setQuitModal(false)} title="Quit Workout?">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-danger/10 border border-danger/20 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-sm text-text-secondary">Your progress will be lost. Save your partial workout?</p>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setQuitModal(false)}>Continue</Button>
            <Button variant="danger" fullWidth onClick={() => router.replace('/training')}>Quit</Button>
          </div>
        </div>
      </Modal>

      {/* Complete Modal */}
      <Modal open={completeModal} onClose={() => setCompleteModal(false)} title="Workout Complete! 🎉">
        <div className="space-y-4">
          <div className="text-center py-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
              <CheckCircle className="w-16 h-16 text-success mx-auto mb-3" />
            </motion.div>
            <p className="text-2xl font-black text-white">Beast Mode!</p>
            <p className="text-text-secondary text-sm mt-1">
              {completedSets} sets · {Math.round((Date.now() - startTime) / 60000)} min
            </p>
          </div>
          <Button fullWidth size="lg" loading={saving} onClick={saveWorkout}>Save Workout</Button>
          <Button variant="ghost" fullWidth onClick={() => router.replace('/dashboard')}>Skip Save</Button>
        </div>
      </Modal>
    </div>
  );
}
