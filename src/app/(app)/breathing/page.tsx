'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { motion, useAnimationControls, AnimatePresence } from 'framer-motion';
import { Wind, Play, Pause, X, CheckCircle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

// ─── Breathing methods ──────────────────────────────────────────────────────
// Each phase drives both the visual guide's scale target and its duration —
// the circle's animation and the on-screen label always stay in lockstep
// since both are derived from the same phase data, not animated separately.

type PhaseType = 'inhale' | 'hold-in' | 'exhale' | 'hold-out';

interface Phase {
  type: PhaseType;
  seconds: number;
}

interface BreathingMethod {
  id: string;
  name: string;
  pattern: string;
  description: string;
  phases: Phase[];
}

const METHODS: BreathingMethod[] = [
  {
    id: 'box',
    name: 'Box Breathing',
    pattern: '4-4-4-4',
    description: 'Equal inhale, hold, exhale, hold. Used by Navy SEALs to stay calm under pressure.',
    phases: [
      { type: 'inhale', seconds: 4 },
      { type: 'hold-in', seconds: 4 },
      { type: 'exhale', seconds: 4 },
      { type: 'hold-out', seconds: 4 },
    ],
  },
  {
    id: '478',
    name: '4-7-8 Relaxing Breath',
    pattern: '4-7-8',
    description: 'A deeply calming pattern popularized by Dr. Andrew Weil — great before sleep.',
    phases: [
      { type: 'inhale', seconds: 4 },
      { type: 'hold-in', seconds: 7 },
      { type: 'exhale', seconds: 8 },
    ],
  },
  {
    id: 'coherent',
    name: 'Coherent Breathing',
    pattern: '5-5',
    description: 'Slow, even breathing to balance your nervous system and lower stress.',
    phases: [
      { type: 'inhale', seconds: 5 },
      { type: 'exhale', seconds: 5 },
    ],
  },
  {
    id: 'extended-exhale',
    name: 'Extended Exhale',
    pattern: '4-6',
    description: 'A longer exhale than inhale triggers your body\'s natural relaxation response.',
    phases: [
      { type: 'inhale', seconds: 4 },
      { type: 'exhale', seconds: 6 },
    ],
  },
  {
    id: 'deep-calm',
    name: 'Deep Calm',
    pattern: '4-2-6',
    description: 'A gentle rhythm with a short hold — good for settling a racing mind.',
    phases: [
      { type: 'inhale', seconds: 4 },
      { type: 'hold-in', seconds: 2 },
      { type: 'exhale', seconds: 6 },
    ],
  },
];

const PHASE_LABEL: Record<PhaseType, string> = {
  'inhale': 'Breathe In',
  'hold-in': 'Hold',
  'exhale': 'Breathe Out',
  'hold-out': 'Hold',
};

const PHASE_SCALE: Record<PhaseType, number> = {
  'inhale': 1.5,
  'hold-in': 1.5,
  'exhale': 0.7,
  'hold-out': 0.7,
};

const DURATIONS = [
  { minutes: 5, label: '5 min' },
  { minutes: 10, label: '10 min' },
];

type Step = 'method' | 'duration' | 'session' | 'complete';

export default function BreathingPage() {
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<BreathingMethod | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number>(5);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const controls = useAnimationControls();
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const cancelledRef = useRef(false);

  // Countdown — ticks every second regardless of animation state, ends the
  // session at 0 rather than waiting for the current breathing phase to finish.
  useEffect(() => {
    if (step !== 'session') return;
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          cancelledRef.current = true;
          controls.stop();
          setStep('complete');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, controls]);

  // Phase cycle — timing is driven by a plain millisecond countdown, NOT by
  // awaiting the animation. Framer Motion resolves an animation immediately
  // if the target value already equals the current one — which is exactly
  // what happens on a "hold" phase, since the circle isn't supposed to move.
  // Awaiting `controls.start()` for a hold made it resolve almost instantly
  // instead of actually waiting out the hold's duration. Driving time
  // separately (and firing the animation without awaiting it) fixes that,
  // and also lets pause freeze the circle mid-phase rather than only
  // freezing the countdown display.
  useEffect(() => {
    if (step !== 'session' || !method) return;
    cancelledRef.current = false;

    async function runCycle() {
      let i = 0;
      while (!cancelledRef.current) {
        const phase = method!.phases[i % method!.phases.length];
        setPhaseIdx(i % method!.phases.length);

        let remainingMs = phase.seconds * 1000;
        let animating = false;

        while (remainingMs > 0 && !cancelledRef.current) {
          if (pausedRef.current) {
            if (animating) { controls.stop(); animating = false; }
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
          if (!animating) {
            controls.start({
              scale: PHASE_SCALE[phase.type],
              transition: { duration: remainingMs / 1000, ease: 'easeInOut' },
            });
            animating = true;
          }
          const tick = Math.min(150, remainingMs);
          await new Promise((r) => setTimeout(r, tick));
          remainingMs -= tick;
        }
        i++;
      }
    }

    runCycle();
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, method]);

  function startSession(m: BreathingMethod, minutes: number) {
    setMethod(m);
    setDurationMinutes(minutes);
    setSecondsLeft(minutes * 60);
    setPhaseIdx(0);
    setPaused(false);
    controls.set({ scale: 0.7 });
    setStep('session');
  }

  function endSession() {
    cancelledRef.current = true;
    controls.stop();
    setStep('method');
    setMethod(null);
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const currentPhase = method?.phases[phaseIdx]?.type ?? 'inhale';

  return (
    <div>
      {step !== 'session' && <Header title="Breathing" showBack />}

      {step === 'method' && (
        <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
          <p className="text-text-secondary text-sm mb-2">Pick a technique to relax and reset.</p>
          {METHODS.map((m) => (
            <motion.button
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => { setMethod(m); setStep('duration'); }}
              className="w-full text-left"
            >
              <Card className="p-4 flex items-center gap-4 hover:border-accent/30 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
                  <Wind className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white">{m.name}</p>
                    <span className="text-[10px] font-mono text-accent bg-accent-muted px-1.5 py-0.5 rounded">{m.pattern}</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{m.description}</p>
                </div>
              </Card>
            </motion.button>
          ))}
        </div>
      )}

      {step === 'duration' && method && (
        <div className="px-4 py-4 max-w-lg mx-auto">
          <button onClick={() => setStep('method')} className="text-xs text-text-secondary mb-4">← Choose a different method</button>
          <h2 className="text-xl font-black text-white mb-1">{method.name}</h2>
          <p className="text-text-secondary text-sm mb-6">How long do you want to practice?</p>
          <div className="grid grid-cols-2 gap-3">
            {DURATIONS.map((d) => (
              <button key={d.minutes} onClick={() => startSession(method, d.minutes)}>
                <Card className="p-6 text-center hover:border-accent/30 transition-colors">
                  <p className="text-3xl font-black text-white">{d.minutes}</p>
                  <p className="text-xs text-text-secondary mt-1">minutes</p>
                </Card>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'session' && method && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-between py-8 px-4">
          <div className="w-full max-w-lg flex items-center justify-between">
            <button onClick={endSession} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/8 transition-colors" aria-label="End session">
              <X className="w-5 h-5" />
            </button>
            <div className="text-center">
              <p className="text-xs text-text-tertiary">{method.name}</p>
              <p className="text-lg font-black text-white tabular-nums">{mins}:{String(secs).padStart(2, '0')}</p>
            </div>
            <button
              onClick={() => setPaused((p) => !p)}
              className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/8 transition-colors"
              aria-label={paused ? 'Resume' : 'Pause'}
            >
              {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center relative w-full">
            <div className="relative w-96 h-96 flex items-center justify-center">
              {/* Faint outer bound so the circle always has room to grow into */}
              <div className="absolute w-full h-full rounded-full border border-accent/15" />
              <motion.div
                animate={controls}
                initial={{ scale: 0.75 }}
                className="absolute rounded-full"
                style={{
                  width: 220,
                  height: 220,
                  background: 'radial-gradient(circle at 35% 30%, #FFD68C 0%, #F5A623 55%, #C97F0F 100%)',
                  boxShadow: '0 0 90px 20px rgba(245,166,35,0.55), 0 0 30px rgba(245,166,35,0.8)',
                }}
              />
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentPhase}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative text-2xl font-black text-black text-center px-4 drop-shadow-sm"
                >
                  {paused ? 'Paused' : PHASE_LABEL[currentPhase]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          <p className="text-text-tertiary text-xs text-center max-w-xs">
            Follow the circle — breathe in as it grows, breathe out as it shrinks.
          </p>
        </div>
      )}

      {step === 'complete' && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm w-full">
            <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">Session Complete</h1>
            <p className="text-text-secondary text-sm mb-6">
              {durationMinutes} minutes of {method?.name ?? 'breathing'}. Nice work.
            </p>
            <Button fullWidth size="lg" onClick={() => { setStep('method'); setMethod(null); }}>
              Done
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
