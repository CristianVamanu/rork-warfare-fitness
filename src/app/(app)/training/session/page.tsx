'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, CheckCircle, Timer, AlertTriangle, Plus, Minus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { logWorkout } from '@/lib/firestore';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';

const EXERCISES = [
  { id: 'e1', name: 'Barbell Back Squat', sets: 4, reps: 5, restSeconds: 180, maxWeight: 300 },
  { id: 'e2', name: 'Romanian Deadlift', sets: 3, reps: 8, restSeconds: 120, maxWeight: 250 },
  { id: 'e3', name: 'Leg Press', sets: 3, reps: 10, restSeconds: 90, maxWeight: 400 },
  { id: 'e4', name: 'Leg Curl', sets: 3, reps: 12, restSeconds: 60, maxWeight: 100 },
];

interface SetLog {
  weight: number;
  reps: number;
  completed: boolean;
}

interface ExerciseLog {
  name: string;
  sets: SetLog[];
}

export default function WorkoutSessionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [currentSetIdx, setCurrentSetIdx] = useState(0);
  const [logs, setLogs] = useState<ExerciseLog[]>(() =>
    EXERCISES.map((ex) => ({
      name: ex.name,
      sets: Array.from({ length: ex.sets }, () => ({
        weight: 0,
        reps: ex.reps,
        completed: false,
      })),
    }))
  );
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restInterval, setRestInterval] = useState<NodeJS.Timeout | null>(null);
  const [quitModal, setQuitModal] = useState(false);
  const [completeModal, setCompleteModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startTime] = useState(Date.now());

  const currentEx = EXERCISES[currentExIdx];
  const currentLog = logs[currentExIdx];
  const currentSet = currentLog?.sets[currentSetIdx];
  const totalSets = EXERCISES.reduce((s, e) => s + e.sets, 0);
  const completedSets = logs.reduce((s, l) => s + l.sets.filter((st) => st.completed).length, 0);

  const startRestTimer = useCallback((seconds: number) => {
    setRestTimer(seconds);
    const interval = setInterval(() => {
      setRestTimer((t) => {
        if (t === null || t <= 1) {
          clearInterval(interval);
          return null;
        }
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
        toast.error(`Max weight is ${currentEx.maxWeight}kg`);
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
    const isLastEx = currentExIdx === EXERCISES.length - 1;

    if (isLastSet && isLastEx) {
      setCompleteModal(true);
      return;
    }

    startRestTimer(currentEx.restSeconds);

    if (isLastSet) {
      setCurrentExIdx((i) => i + 1);
      setCurrentSetIdx(0);
    } else {
      setCurrentSetIdx((s) => s + 1);
    }
  };

  const saveWorkout = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const duration = Math.round((Date.now() - startTime) / 60000);
      await logWorkout({
        userId: user.uid,
        exercises: logs,
        duration,
        calories: Math.round(duration * 8),
      });
      toast.success('Workout saved!');
      router.replace('/dashboard');
    } catch {
      toast.error('Failed to save workout');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Session Header */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-white/8 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setQuitModal(true)} className="p-2 rounded-xl text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-xs text-text-secondary">Exercise {currentExIdx + 1} of {EXERCISES.length}</p>
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
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
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
                <p className="text-xs text-text-secondary text-center mb-3">WEIGHT (kg)</p>
                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={() => updateSet('weight', -2.5)}
                    className="w-12 h-12 rounded-full bg-surface-elevated border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="text-center">
                    <p className="text-5xl font-black text-white w-24 text-center">{currentSet?.weight || 0}</p>
                    <p className="text-xs text-text-tertiary">kg</p>
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

              {/* Set History */}
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
              else if (currentExIdx > 0) { setCurrentExIdx((i) => i - 1); setCurrentSetIdx(EXERCISES[currentExIdx - 1].sets - 1); }
            }}
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              const isLastSet = currentSetIdx === currentEx.sets - 1;
              const isLastEx = currentExIdx === EXERCISES.length - 1;
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
            <p className="text-sm text-text-secondary">
              Your progress will be lost if you quit now. Save your partial workout first?
            </p>
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
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
            >
              <CheckCircle className="w-16 h-16 text-success mx-auto mb-3" />
            </motion.div>
            <p className="text-2xl font-black text-white">Beast Mode!</p>
            <p className="text-text-secondary text-sm mt-1">
              {completedSets} sets · {Math.round((Date.now() - startTime) / 60000)} min
            </p>
          </div>
          <Button fullWidth size="lg" loading={saving} onClick={saveWorkout}>
            Save Workout
          </Button>
          <Button variant="ghost" fullWidth onClick={() => router.replace('/dashboard')}>
            Skip Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
