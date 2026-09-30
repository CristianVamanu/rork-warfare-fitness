'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, useAnimationControls, AnimatePresence } from 'framer-motion';
import { Wind, Play, Pause, X, CheckCircle, AlertTriangle, Snowflake, Zap } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PaywallGate } from '@/components/ui/PaywallGate';
import { CornerBrackets } from '@/components/landing/chrome';
import { TechBackdrop } from '@/components/ui/TechField';

// ─── Breathing methods ──────────────────────────────────────────────────────
// Each phase drives both the visual guide's scale target and its duration —
// the circle's animation and the on-screen label always stay in lockstep
// since both are derived from the same phase data, not animated separately.

type PhaseType = 'inhale' | 'hold-in' | 'exhale' | 'hold-out';

interface Phase {
  type: PhaseType;
  seconds: number;
  /** Round-based methods: which round this phase belongs to (1-based). */
  round?: number;
  /** Breathing phases in a round: which breath this is, out of `of`. */
  breath?: number;
  of?: number;
  /** What the big readout under the circle should call this phase. */
  stage?: 'breathing' | 'retention' | 'recovery';
}

interface BreathingMethod {
  id: string;
  name: string;
  pattern: string;
  description: string;
  /** Timed methods loop `phases` until the clock runs out; round methods
   *  run `phases` once, start to finish, and end when the last phase ends. */
  kind: 'timed' | 'rounds';
  phases: Phase[];
  /** Round methods: the plan, for the briefing screen and the HUD. */
  rounds?: { breaths: number; holdSeconds: number }[];
  /**
   * Shown before the session starts, for methods where that matters.
   *
   * Only one method has ever needed this, and it needs it badly: the Wim
   * Hof cycle deliberately drives CO2 down and people do faint doing it.
   * The other five are ordinary paced breathing at a normal rate.
   */
  safety?: string;
}

/**
 * The Wim Hof method, as it is actually taught: three rounds.
 *
 * Each round is thirty full breaths at a brisk pace (about three seconds a
 * breath, in fully, let the exhale fall out), then a retention hold on
 * empty lungs, then one deep recovery breath held for fifteen seconds.
 * Retention grows across the rounds: one minute, then a minute and a
 * half, then a minute and a half again. The session is the three rounds,
 * not a number of minutes, and it ends when round three ends.
 *
 * The holds are fixed lengths rather than "as long as you can". A guided
 * timer cannot tell when someone is struggling, and the method's own
 * instruction is to hold only as long as it stays comfortable — so each
 * one is a ceiling to breathe again at, not a target to beat. The copy
 * says so, and the safety text says why.
 */
const WIM_HOF_ROUNDS = [
  { breaths: 30, holdSeconds: 60 },
  { breaths: 30, holdSeconds: 90 },
  { breaths: 30, holdSeconds: 90 },
];
const WIM_INHALE_S = 1.6;
const WIM_EXHALE_S = 1.4;
const WIM_RECOVERY_INHALE_S = 2;
const WIM_RECOVERY_HOLD_S = 15;

function wimHofPhases(): Phase[] {
  const phases: Phase[] = [];
  WIM_HOF_ROUNDS.forEach((r, ri) => {
    const round = ri + 1;
    for (let b = 1; b <= r.breaths; b++) {
      phases.push({ type: 'inhale', seconds: WIM_INHALE_S, round, breath: b, of: r.breaths, stage: 'breathing' });
      phases.push({ type: 'exhale', seconds: WIM_EXHALE_S, round, breath: b, of: r.breaths, stage: 'breathing' });
    }
    phases.push({ type: 'hold-out', seconds: r.holdSeconds, round, stage: 'retention' });
    phases.push({ type: 'inhale', seconds: WIM_RECOVERY_INHALE_S, round, stage: 'recovery' });
    phases.push({ type: 'hold-in', seconds: WIM_RECOVERY_HOLD_S, round, stage: 'recovery' });
  });
  return phases;
}

/** Total seconds a round method takes, for the briefing and the HUD. */
function totalSeconds(phases: Phase[]): number {
  return Math.round(phases.reduce((s, p) => s + p.seconds, 0));
}

const METHODS: BreathingMethod[] = [
  {
    id: 'box',
    name: 'Box Breathing',
    pattern: '4-4-4-4',
    description: 'Equal inhale, hold, exhale, hold. Used by Navy SEALs to stay calm under pressure.',
    kind: 'timed',
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
    kind: 'timed',
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
    kind: 'timed',
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
    kind: 'timed',
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
    kind: 'timed',
    phases: [
      { type: 'inhale', seconds: 4 },
      { type: 'hold-in', seconds: 2 },
      { type: 'exhale', seconds: 6 },
    ],
  },
  {
    id: 'wim-hof',
    name: 'Wim Hof Method',
    pattern: '3 rounds · 30 breaths · hold',
    description:
      'Three rounds. Thirty deep breaths, hold on empty lungs, one recovery breath held for fifteen seconds. Holds run 1:00, then 1:30, then 1:30. Breathe in fully and let the exhale fall out — do not force it.',
    kind: 'rounds',
    rounds: WIM_HOF_ROUNDS,
    safety:
      'Sit or lie down before you start, and stay there for the whole session. Never do this in or near water, in a bath or shower, while driving, or standing up — this pattern can make you light-headed and people do faint doing it. That is the reason for the position, not a formality. Come out of the hold and breathe normally the moment it stops being comfortable; the timer is a ceiling, not a target. Skip this method if you are pregnant, or have epilepsy, a heart condition, or high blood pressure, unless a doctor has told you otherwise.',
    phases: wimHofPhases(),
  },
];

const PHASE_LABEL: Record<PhaseType, string> = {
  'inhale': 'Breathe In',
  'hold-in': 'Hold',
  'exhale': 'Breathe Out',
  'hold-out': 'Hold',
};

// Base circle is 220px inside a 384px (w-96) container — 1.75x fills it
// all the way to the outer bound on a full inhale.
const PHASE_SCALE: Record<PhaseType, number> = {
  'inhale': 1.75,
  'hold-in': 1.75,
  'exhale': 0.55,
  'hold-out': 0.55,
};

const DURATIONS = [
  { minutes: 5, label: '5 min' },
  { minutes: 10, label: '10 min' },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

type Step = 'method' | 'duration' | 'session' | 'complete';

export default function BreathingPage() {
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<BreathingMethod | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number>(5);
  /** Timed methods: seconds remaining. Round methods: seconds elapsed. */
  const [clock, setClock] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  /** Seconds left in the current phase, for the hold countdown. */
  const [phaseLeft, setPhaseLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);

  const controls = useAnimationControls();
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const cancelledRef = useRef(false);

  const isRounds = method?.kind === 'rounds';
  const planSeconds = useMemo(() => (method ? totalSeconds(method.phases) : 0), [method]);

  // The session clock. Timed methods count down and end at zero; round
  // methods count up and are ended by the phase runner when the last phase
  // finishes, so the third retention is never cut short by a clock.
  useEffect(() => {
    if (step !== 'session' || !method) return;
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      if (method.kind === 'rounds') { setClock((s) => s + 1); return; }
      setClock((s) => {
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
  }, [step, method, controls]);

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
    const m = method;

    async function runCycle() {
      let i = 0;
      while (!cancelledRef.current) {
        if (m.kind === 'rounds' && i >= m.phases.length) {
          // The last round is done: the session is complete, not looped.
          controls.stop();
          setStep('complete');
          return;
        }
        const phase = m.phases[i % m.phases.length];
        setPhaseIdx(i % m.phases.length);

        let remainingMs = phase.seconds * 1000;
        setPhaseLeft(phase.seconds);
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
          setPhaseLeft(Math.ceil(remainingMs / 1000));
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
    setClock(m.kind === 'rounds' ? 0 : minutes * 60);
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

  function requestQuit() {
    setPaused(true);
    setQuitConfirmOpen(true);
  }

  function cancelQuit() {
    setQuitConfirmOpen(false);
    setPaused(false);
  }

  function confirmQuit() {
    setQuitConfirmOpen(false);
    endSession();
  }

  const phase = method?.phases[phaseIdx];
  const currentPhase: PhaseType = phase?.type ?? 'inhale';
  const roundCount = method?.rounds?.length ?? 0;
  const progressPct = method
    ? (isRounds ? Math.min(100, (clock / Math.max(1, planSeconds)) * 100) : ((durationMinutes * 60 - clock) / (durationMinutes * 60)) * 100)
    : 0;
  /** What comes after this phase, for the round HUD's "next" line. */
  const nextHint = (() => {
    if (!method || !isRounds || !phase) return '';
    const r = method.rounds?.[(phase.round ?? 1) - 1];
    if (phase.stage === 'breathing') return `then hold ${fmt(r?.holdSeconds ?? 0)}`;
    if (phase.stage === 'retention') return `then one deep breath, hold ${WIM_RECOVERY_HOLD_S}s`;
    const isLast = (phase.round ?? 1) >= roundCount;
    return isLast ? 'last round, then done' : `then round ${(phase.round ?? 1) + 1}`;
  })();

  return (
    <div>
      {step !== 'session' && <Header title="Breathing" showBack />}
      <PaywallGate feature="breathing" noTaste>

      {step === 'method' && (
        <div className="px-4 py-4 space-y-3 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <p className="text-[10px] font-semibold tracking-[0.28em] text-accent/90 uppercase">Reset</p>
            <span className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
          </div>
          <p className="text-text-secondary text-sm mb-2">Pick a technique. Follow the circle. Nothing else to think about.</p>
          {METHODS.map((m, i) => (
            <motion.button
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => { setMethod(m); setStep('duration'); }}
              className="w-full text-left"
            >
              <Card glass className="group relative p-4 flex items-center gap-4 hover:border-accent/40 transition-colors overflow-hidden">
                <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 ${m.kind === 'rounds' ? 'border-sky-400/30 bg-sky-400/10 text-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.18)]' : 'border-accent/30 bg-accent/10 text-accent shadow-[0_0_20px_rgb(var(--accent-rgb)/0.18)]'}`}>
                  {m.kind === 'rounds' ? <Snowflake className="w-5 h-5" strokeWidth={1.75} /> : <Wind className="w-5 h-5" strokeWidth={1.75} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-white">{m.name}</p>
                    <span className="wf-readout text-[10px] text-accent border border-accent/25 bg-accent/10 px-1.5 py-0.5 rounded">{m.pattern}</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{m.description}</p>
                </div>
              </Card>
            </motion.button>
          ))}
        </div>
      )}

      {step === 'duration' && method && (
        <div className="px-4 py-4 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
          <button onClick={() => setStep('method')} className="text-xs text-text-secondary mb-4">← Choose a different method</button>
          <p className="text-[10px] font-semibold tracking-[0.28em] text-accent/90 uppercase">{isRounds ? 'The protocol' : 'Session length'}</p>
          <h2 className="text-xl font-black text-white mt-1 mb-1">{method.name}</h2>
          <p className="text-text-secondary text-sm mb-4">{isRounds ? `Three rounds, about ${Math.round(planSeconds / 60)} minutes. It ends when round three ends.` : 'How long do you want to practice?'}</p>

          {/* Placed here rather than on the method card, because this is the
              last screen before the session actually starts — a warning one
              tap earlier is a warning that can be scrolled past and
              forgotten. Not dismissible, and not behind a "got it" button
              either: a checkbox people tap reflexively is worse than text
              they have to read on the way to the thing they came for. */}
          {method.safety && (
            <div className="flex items-start gap-3 p-4 mb-5 rounded-2xl bg-amber-400/[0.08] border border-amber-400/30">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-amber-400 mb-1.5">
                  Read before you start
                </p>
                <p className="text-sm text-text-secondary leading-relaxed">{method.safety}</p>
              </div>
            </div>
          )}

          {isRounds && method.rounds ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 overflow-hidden divide-y divide-white/6">
                {method.rounds.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="wf-readout text-[10px] font-bold text-accent w-16">Round {i + 1}</span>
                    <span className="flex-1 text-sm text-white font-semibold">{r.breaths} breaths <span className="text-text-tertiary font-normal">· ~{Math.round(r.breaths * (WIM_INHALE_S + WIM_EXHALE_S))}s</span></span>
                    <span className="text-sm font-black tabular-nums text-white">hold {fmt(r.holdSeconds)}</span>
                    <span className="text-[10px] text-text-tertiary">+ {WIM_RECOVERY_HOLD_S}s recovery</span>
                  </div>
                ))}
              </div>
              <Button fullWidth size="lg" onClick={() => startSession(method, 0)}>
                <Zap className="w-4 h-4" /> Start round 1
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {DURATIONS.map((d) => (
                <button key={d.minutes} onClick={() => startSession(method, d.minutes)}>
                  <Card glass className="group relative p-6 text-center hover:border-accent/40 transition-colors">
                    <CornerBrackets size="w-3 h-3" />
                    <p className="text-3xl font-black text-white tabular-nums">{d.minutes}</p>
                    <p className="text-[10px] font-semibold tracking-[0.24em] uppercase text-text-tertiary mt-1">minutes</p>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'session' && method && (
        <div className="relative min-h-screen bg-background flex flex-col items-center justify-between py-6 px-4 overflow-hidden">
          <TechBackdrop className="opacity-40" />
          {/* thin session progress along the very top */}
          <div className="absolute inset-x-0 top-0 h-0.5 bg-white/5">
            <div className="h-full bg-accent shadow-[0_0_12px_rgb(var(--accent-rgb)/0.9)] transition-[width] duration-1000" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="relative w-full max-w-lg md:max-w-2xl lg:max-w-4xl flex items-center justify-between">
            <button onClick={requestQuit} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/8 transition-colors" aria-label="End session">
              <X className="w-5 h-5" />
            </button>
            <div className="text-center">
              <p className="wf-readout text-[10px] font-bold text-text-tertiary">{method.name}</p>
              <p className="text-lg font-black text-white tabular-nums">{fmt(clock)}{isRounds && <span className="text-[11px] font-semibold text-text-tertiary"> / {fmt(planSeconds)}</span>}</p>
            </div>
            <button
              onClick={() => setPaused((p) => !p)}
              className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/8 transition-colors"
              aria-label={paused ? 'Resume' : 'Pause'}
            >
              {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
          </div>

          {/* Round tracker */}
          {isRounds && (
            <div className="relative flex items-center gap-2 mt-2">
              {Array.from({ length: roundCount }, (_, i) => {
                const r = i + 1; const cur = phase?.round ?? 1;
                return (
                  <span key={r} className={`wf-readout text-[10px] font-bold px-2.5 py-1 rounded-md border transition-colors ${
                    r < cur ? 'border-accent/40 bg-accent/15 text-accent' : r === cur ? 'border-accent bg-accent text-black shadow-[0_0_16px_rgb(var(--accent-rgb)/0.6)]' : 'border-white/10 text-text-tertiary'
                  }`}>R{r}</span>
                );
              })}
            </div>
          )}

          <div className="relative flex-1 flex items-center justify-center w-full">
            <div className="relative w-96 h-96 max-w-[90vw] max-h-[90vw] flex items-center justify-center">
              {/* Faint outer bound so the circle always has room to grow into */}
              <div className="absolute w-full h-full rounded-full border border-accent/15" />
              <div className="absolute w-[70%] h-[70%] rounded-full border border-dashed border-accent/10" />
              <motion.div
                animate={controls}
                initial={{ scale: 0.75 }}
                className="absolute rounded-full"
                style={{
                  width: 220,
                  height: 220,
                  background: phase?.stage === 'retention'
                    ? 'radial-gradient(circle at 35% 30%, #9ad6ff 0%, #38bdf8 55%, #0e7490 100%)'
                    : 'radial-gradient(circle at 35% 30%, #FFD68C 0%, #F5A623 55%, #C97F0F 100%)',
                  boxShadow: phase?.stage === 'retention'
                    ? '0 0 90px 20px rgba(56,189,248,0.45), 0 0 30px rgba(56,189,248,0.8)'
                    : '0 0 90px 20px rgba(245,166,35,0.55), 0 0 30px rgba(245,166,35,0.8)',
                }}
              />
              <AnimatePresence mode="wait">
                <motion.p
                  key={`${currentPhase}-${paused}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative text-2xl font-black text-black text-center px-4 drop-shadow-sm"
                >
                  {paused ? 'Paused' : phase?.stage === 'retention' ? 'Hold · empty' : phase?.stage === 'recovery' && currentPhase === 'hold-in' ? 'Hold · full' : PHASE_LABEL[currentPhase]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* The counter and the timer. Breathing: which breath of thirty.
              Retention and recovery: the seconds left in the hold. */}
          {isRounds && phase ? (
            <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm px-5 py-4 text-center">
              <CornerBrackets size="w-3 h-3" />
              {phase.stage === 'breathing' ? (
                <>
                  <p className="text-[10px] font-semibold tracking-[0.28em] uppercase text-text-tertiary">Breath</p>
                  <p className="text-5xl font-black text-white tabular-nums leading-none mt-1">{phase.breath}<span className="text-lg text-text-tertiary"> / {phase.of}</span></p>
                </>
              ) : (
                <>
                  <p className="text-[10px] font-semibold tracking-[0.28em] uppercase text-text-tertiary">{phase.stage === 'retention' ? 'Retention · breathe when you need to' : 'Recovery hold'}</p>
                  <p className={`text-5xl font-black tabular-nums leading-none mt-1 ${phase.stage === 'retention' ? 'text-sky-300' : 'text-white'}`}>{fmt(phaseLeft)}</p>
                </>
              )}
              <p className="text-[11px] text-text-tertiary mt-2">Round {phase.round} of {roundCount} · {nextHint}</p>
            </div>
          ) : (
            <p className="relative text-text-tertiary text-xs text-center max-w-xs">
              Follow the circle — breathe in as it grows, breathe out as it shrinks.
            </p>
          )}

          <Modal open={quitConfirmOpen} onClose={cancelQuit} title="End this session?">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-amber-400/10 border border-amber-400/20 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-text-secondary">
                  {isRounds
                    ? `You're in round ${phase?.round ?? 1} of ${roundCount}. Quit now?`
                    : `You're ${Math.round(progressPct)}% through this ${durationMinutes}-minute session. Quit now?`}
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" fullWidth onClick={cancelQuit}>Keep Going</Button>
                <Button variant="danger" fullWidth onClick={confirmQuit}>End Session</Button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {step === 'complete' && (
        <div className="relative min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center overflow-hidden">
          <TechBackdrop className="opacity-40" />
          <div className="relative max-w-sm w-full wf-rise">
            <div className="w-16 h-16 rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_30px_rgb(var(--accent-rgb)/0.3)] flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-accent" />
            </div>
            <p className="text-[10px] font-semibold tracking-[0.28em] uppercase text-accent/90">Complete</p>
            <h1 className="text-2xl font-black text-white mt-1 mb-2">{method?.name ?? 'Breathing'}</h1>
            {isRounds && method?.rounds ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 divide-y divide-white/6 text-left mb-6">
                {method.rounds.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="wf-readout text-[10px] font-bold text-accent">Round {i + 1}</span>
                    <span className="text-white">{r.breaths} breaths · held {fmt(r.holdSeconds)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="wf-readout text-[10px] font-bold text-text-tertiary">Total</span>
                  <span className="text-white font-black tabular-nums">{fmt(clock)}</span>
                </div>
              </div>
            ) : (
              <p className="text-text-secondary text-sm mb-6">{durationMinutes} minutes. Nice work.</p>
            )}
            <Button fullWidth size="lg" onClick={() => { setStep('method'); setMethod(null); }}>
              Done
            </Button>
          </div>
        </div>
      )}
      </PaywallGate>
    </div>
  );
}
