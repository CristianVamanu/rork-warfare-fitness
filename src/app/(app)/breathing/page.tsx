'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, X, AlertTriangle, Volume2, VolumeX, Loader2, Repeat } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PaywallGate } from '@/components/ui/PaywallGate';
import { GuidedVideo } from '@/components/ui/GuidedVideo';
import { BreathCircle } from '@/components/breathing/BreathCircle';
import { CosmicBackdrop } from '@/components/breathing/CosmicBackdrop';
import { useBreathAudio } from '@/lib/useBreathAudio';
import { getBreathTracks, playableUrl, BUILT_IN_TRACK } from '@/lib/breathTracks';
import type { BreathTrack } from '@/types';

// ─── Breathing methods ──────────────────────────────────────────────────────
// A session is a timeline of segments. Each segment says how long it lasts
// and where the circle starts and ends, so the ring, the arcs and the words
// are all read off one clock and can never drift apart.

type PhaseType = 'inhale' | 'top-up' | 'hold-in' | 'exhale' | 'hold-out';

interface Phase {
  type: PhaseType;
  seconds: number;
  round?: number;
  breath?: number;
  of?: number;
  stage?: 'breathing' | 'retention' | 'recovery' | 'settle';
  word?: string;
  hint?: string;
}

interface BreathingMethod {
  id: string;
  name: string;
  pattern: string;
  description: string;
  /** Timed methods loop `phases` to fill the chosen minutes; round methods
   *  run `phases` once; the reset builds its own timeline from the minutes. */
  kind: 'timed' | 'rounds' | 'reset';
  phases: Phase[];
  rounds?: { breaths: number; holdSeconds: number }[];
  minutes?: number[];
  safety?: string;
  guided?: { videoId: string; title: string; credit: string };
  featured?: boolean;
}

/** The Wim Hof method as taught: three rounds, fixed holds as a ceiling. */
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
      phases.push({ type: 'inhale', seconds: WIM_INHALE_S, round, breath: b, of: r.breaths, stage: 'breathing', hint: 'FULL BREATH IN' });
      phases.push({ type: 'exhale', seconds: WIM_EXHALE_S, round, breath: b, of: r.breaths, stage: 'breathing', hint: 'LET IT FALL OUT' });
    }
    phases.push({ type: 'hold-out', seconds: r.holdSeconds, round, stage: 'retention', word: 'HOLD', hint: 'BREATHE WHEN YOU NEED TO' });
    phases.push({ type: 'inhale', seconds: WIM_RECOVERY_INHALE_S, round, stage: 'recovery', word: 'DEEP BREATH IN', hint: 'ALL THE WAY' });
    phases.push({ type: 'hold-in', seconds: WIM_RECOVERY_HOLD_S, round, stage: 'recovery', word: 'HOLD', hint: 'LUNGS FULL' });
  });
  return phases;
}

/** The Reset: cyclic sighing at an unhurried pace, then a slow settle. */
function resetPhases(minutes: number): Phase[] {
  const settle = 30;
  const cycles = Math.floor((minutes * 60 - settle) / 12);
  const phases: Phase[] = [];
  for (let i = 1; i <= cycles; i++) {
    phases.push({ type: 'inhale', seconds: 3, breath: i, of: cycles, word: 'IN', hint: 'THROUGH THE NOSE' });
    phases.push({ type: 'top-up', seconds: 1, breath: i, of: cycles, word: 'A LITTLE MORE', hint: 'A SMALL SIP ON TOP' });
    phases.push({ type: 'exhale', seconds: 8, breath: i, of: cycles, word: 'OUT', hint: 'SLOW · THROUGH THE MOUTH' });
  }
  const d = settle / 2;
  phases.push({ type: 'inhale', seconds: d * 0.42, stage: 'settle', word: 'SLOW BREATH IN', hint: 'NO RUSH' });
  phases.push({ type: 'exhale', seconds: d * 0.58, stage: 'settle', word: 'LET IT GO', hint: 'NO RUSH' });
  phases.push({ type: 'inhale', seconds: d * 0.42, stage: 'settle', word: 'ONE MORE', hint: 'NO RUSH' });
  phases.push({ type: 'exhale', seconds: d * 0.58, stage: 'settle', word: 'ALL THE WAY OUT', hint: 'NO RUSH' });
  return phases;
}

const METHODS: BreathingMethod[] = [
  {
    id: 'reset',
    name: 'The Reset',
    pattern: '3 · 1 · 8',
    description: 'Breathe in, a little more on top, then a long slow breath out. Cyclic sighing, the pattern a 2023 Stanford study found lifted mood more than meditation. Ends with a slow settle.',
    kind: 'reset',
    phases: [],
    minutes: [3, 5],
    featured: true,
  },
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
    description: 'A deeply calming pattern popularized by Dr. Andrew Weil. Good before sleep.',
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
    description: 'A gentle rhythm with a short hold. Good for settling a racing mind.',
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
      'Three rounds. Thirty deep breaths, hold on empty lungs, one recovery breath held for fifteen seconds. Holds run 1:00, then 1:30, then 1:30. Breathe in fully and let the exhale fall out. Do not force it.',
    kind: 'rounds',
    rounds: WIM_HOF_ROUNDS,
    safety:
      'Sit or lie down before you start, and stay there for the whole session. Never do this in or near water, in a bath or shower, while driving, or standing up. This pattern can make you light-headed and people do faint doing it. That is the reason for the position, not a formality. Come out of the hold and breathe normally the moment it stops being comfortable; the timer is a ceiling, not a target. Skip this method if you are pregnant, or have epilepsy, a heart condition, or high blood pressure, unless a doctor has told you otherwise.',
    phases: wimHofPhases(),
    guided: { videoId: 'tybOi4hjZFQ', title: 'Guided Wim Hof breathing, 3 rounds', credit: 'Video by Wim Hof, played from YouTube. Same safety rules apply: sit or lie down, never in water.' },
  },
];

const WORD: Record<PhaseType, string> = { 'inhale': 'IN', 'top-up': 'A LITTLE MORE', 'hold-in': 'HOLD', 'exhale': 'OUT', 'hold-out': 'HOLD' };
const HINT: Record<PhaseType, string> = { 'inhale': 'THROUGH THE NOSE', 'top-up': 'A SMALL SIP ON TOP', 'hold-in': 'LUNGS FULL', 'exhale': 'SLOW · THROUGH THE MOUTH', 'hold-out': 'LUNGS EMPTY' };

const TRACK_PREF = 'wf-breath-track';
const DEFAULT_MINUTES = [5, 10];
const REPEATS = [1, 2, 3];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
const easeInOut = (x: number) => -(Math.cos(Math.PI * Math.max(0, Math.min(1, x))) - 1) / 2;

// ─── Timeline ───────────────────────────────────────────────────────────────

interface Seg extends Phase { at: number; from: number; to: number; rep: number }

/** Where the ring should end a phase, given where it starts. */
function targetFor(p: Phase, from: number, kind: BreathingMethod['kind']): number {
  switch (p.type) {
    case 'inhale': return p.stage === 'recovery' ? 1 : p.stage === 'settle' ? 0.5 : kind === 'reset' ? 0.8 : 0.88;
    case 'top-up': return 1;
    case 'exhale': return p.stage === 'settle' ? 0.34 : 0.3;
    case 'hold-in': return from;
    case 'hold-out': return from;
  }
}

function buildTimeline(m: BreathingMethod, minutes: number, repeats: number): Seg[] {
  const one: Phase[] = m.kind === 'reset' ? resetPhases(minutes) : m.kind === 'rounds' ? m.phases : (() => {
    const out: Phase[] = []; let t = 0; let breath = 0;
    while (t < minutes * 60) {
      breath++;
      for (const p of m.phases) { out.push({ ...p, breath }); t += p.seconds; }
    }
    return out;
  })();
  const segs: Seg[] = [];
  let at = 0; let from = 0.34;
  for (let rep = 1; rep <= repeats; rep++) {
    for (const p of one) {
      const to = targetFor(p, from, m.kind);
      segs.push({ ...p, at, from, to, rep });
      at += p.seconds; from = to;
    }
  }
  return segs;
}

type Step = 'method' | 'setup' | 'session' | 'complete';

export default function BreathingPage() {
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<BreathingMethod | null>(null);
  const [minutes, setMinutes] = useState(5);
  const [repeats, setRepeats] = useState(1);
  const [timeline, setTimeline] = useState<Seg[]>([]);
  const [now, setNow] = useState(0); // seconds elapsed in the session
  const [paused, setPaused] = useState(false);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);

  const music = useBreathAudio();
  const [tracks, setTracks] = useState<BreathTrack[]>([BUILT_IN_TRACK]);
  const [trackId, setTrackId] = useState<string>(BUILT_IN_TRACK.id);
  const track = tracks.find((t) => t.id === trackId) ?? BUILT_IN_TRACK;
  useEffect(() => {
    try { const v = localStorage.getItem(TRACK_PREF); if (v) setTrackId(v); } catch { /* ignore */ }
    getBreathTracks().then(setTracks).catch(() => { /* the built-in track still plays */ });
  }, []);
  const pickTrack = (id: string) => { setTrackId(id); try { localStorage.setItem(TRACK_PREF, id); } catch { /* ignore */ } };
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const total = useMemo(() => timeline.length ? timeline[timeline.length - 1].at + timeline[timeline.length - 1].seconds : 0, [timeline]);
  const isRounds = method?.kind === 'rounds';

  // One clock. A requestAnimationFrame loop accumulates elapsed time while
  // not paused and publishes it at roughly thirty frames a second; every
  // visual is derived from that number, so pause freezes everything at once.
  useEffect(() => {
    if (step !== 'session') return;
    let raf = 0; let last = performance.now(); let lastPub = 0;
    const tick = (ts: number) => {
      const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
      if (!pausedRef.current) elapsedRef.current += dt;
      if (ts - lastPub > 33) { lastPub = ts; setNow(elapsedRef.current); }
      if (elapsedRef.current >= total && total > 0) { setStep('complete'); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, total]);

  useEffect(() => { if (step === 'complete') music.stop(); }, [step, music]);
  useEffect(() => { if (step !== 'session') return; if (paused) music.pause(); else music.resume(); }, [paused, step, music]);

  const startSession = useCallback((m: BreathingMethod, mins: number, reps: number) => {
    setMethod(m); setMinutes(mins); setRepeats(reps);
    setTimeline(buildTimeline(m, mins, reps));
    elapsedRef.current = 0; setNow(0); setPaused(false);
    setStep('session');
    void music.start(playableUrl(track));
  }, [music, track]);

  function endSession() { music.stop(); setStep('method'); setMethod(null); }
  function requestQuit() { setPaused(true); setQuitConfirmOpen(true); }
  function cancelQuit() { setQuitConfirmOpen(false); setPaused(false); }
  function confirmQuit() { setQuitConfirmOpen(false); endSession(); }

  // ── derive the frame ──
  const seg = useMemo(() => {
    if (!timeline.length) return null;
    let lo = 0, hi = timeline.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (timeline[mid].at <= now) lo = mid; else hi = mid - 1; }
    return timeline[lo];
  }, [timeline, now]);
  const phaseProgress = seg ? Math.max(0, Math.min(1, (now - seg.at) / seg.seconds)) : 0;
  const size = seg ? seg.from + (seg.to - seg.from) * easeInOut(phaseProgress) : 0.34;
  const sessionProgress = total ? now / total : 0;
  const left = Math.max(0, Math.ceil(total - now));
  const word = paused ? 'PAUSED' : seg ? (seg.word ?? WORD[seg.type]) : '';
  const hint = paused ? 'TAKE YOUR TIME' : seg ? (seg.hint ?? HINT[seg.type]) : '';
  const tone: 'gold' | 'ice' = seg?.stage === 'retention' ? 'ice' : 'gold';
  const topLeft = (() => {
    if (!seg || !method) return '';
    const rep = repeats > 1 ? `ROUND ${seg.rep} / ${repeats} · ` : '';
    if (seg.stage === 'settle') return `${rep}SETTLE`;
    if (method.kind === 'rounds') return `${rep}R${seg.round}${seg.stage === 'breathing' ? ` · BREATH ${seg.breath} / ${seg.of}` : seg.stage === 'retention' ? ' · RETENTION' : ' · RECOVERY'}`;
    if (method.kind === 'reset') return `${rep}BREATH ${seg.breath} / ${seg.of}`;
    return `${rep}BREATH ${seg.breath}`;
  })();
  const topRight = seg?.stage === 'retention' || seg?.stage === 'recovery' ? `${Math.ceil(seg.seconds - (now - seg.at))}s · ${fmt(left)}` : fmt(left);
  const fadeIn = Math.min(1, now / 1.5);
  const fadeOut = total ? Math.min(1, Math.max(0, (total - now) / 1.5)) : 1;

  const minuteOptions = method?.minutes ?? DEFAULT_MINUTES;
  const planSeconds = method ? (method.kind === 'rounds' ? Math.round(method.phases.reduce((s, p) => s + p.seconds, 0)) : minutes * 60) : 0;

  return (
    <div className="wf-dark relative min-h-screen bg-[#040302] text-white">
      <CalmBackdrop />
      {step !== 'session' && <div className="relative"><Header title="Breathing" showBack /></div>}
      <PaywallGate feature="breathing" noTaste>

      {step === 'method' && (
        <div className="relative px-4 py-4 space-y-3 max-w-lg md:max-w-2xl mx-auto">
          <p className="text-center text-[11px] font-medium tracking-[0.5em] pl-[0.5em] text-[#FFE2B4]/70 pt-2">FOLLOW THE CIRCLE</p>
          <p className="text-center text-sm text-white/50 pb-3">Pick a method. The circle does the rest.</p>
          {METHODS.map((m, i) => (
            <motion.button
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => { setMethod(m); setMinutes((m.minutes ?? DEFAULT_MINUTES)[0]); setRepeats(1); setStep('setup'); }}
              className="w-full text-left"
            >
              <div className={`relative rounded-3xl border p-4 flex items-center gap-4 transition-colors ${m.featured ? 'border-[#F5A623]/40 bg-[#F5A623]/[0.06] shadow-[0_0_60px_rgba(245,166,35,0.10)]' : 'border-white/10 bg-white/[0.03] hover:border-[#F5A623]/30'}`}>
                <MiniRing featured={!!m.featured} ice={m.kind === 'rounds'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white tracking-wide">{m.name}</p>
                    <span className="text-[10px] tracking-[0.2em] text-[#FFE2B4]/70 border border-[#FFE2B4]/20 px-1.5 py-0.5 rounded">{m.pattern}</span>
                    {m.featured && <span className="text-[10px] tracking-[0.2em] text-black bg-[#F5A623] px-1.5 py-0.5 rounded font-bold">NEW</span>}
                  </div>
                  <p className="text-xs text-white/50 mt-1 leading-relaxed">{m.description}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {step === 'setup' && method && (
        <div className="relative px-4 py-4 max-w-lg md:max-w-2xl mx-auto">
          <button onClick={() => setStep('method')} className="text-xs text-white/50 mb-5 tracking-wide">← Choose a different method</button>
          <p className="text-[11px] font-medium tracking-[0.5em] pl-[0.5em] text-[#FFE2B4]/70">{isRounds ? 'THE PROTOCOL' : 'SESSION'}</p>
          <h2 className="text-2xl font-semibold text-white mt-2 mb-1 tracking-wide">{method.name}</h2>
          <p className="text-white/50 text-sm mb-6 leading-relaxed">{method.description}</p>

          {method.safety && (
            <div className="flex items-start gap-3 p-4 mb-6 rounded-2xl bg-amber-400/[0.08] border border-amber-400/30">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-amber-400 mb-1.5">Read before you start</p>
                <p className="text-sm text-white/70 leading-relaxed">{method.safety}</p>
              </div>
            </div>
          )}

          {isRounds && method.rounds && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/[0.06] mb-6">
              {method.rounds.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="text-[10px] tracking-[0.2em] text-[#FFE2B4]/70 w-16">ROUND {i + 1}</span>
                  <span className="flex-1 text-white/85">{r.breaths} breaths</span>
                  <span className="text-white font-semibold tabular-nums">hold {fmt(r.holdSeconds)}</span>
                </div>
              ))}
            </div>
          )}

          {!isRounds && (
            <>
              <p className="text-[10px] tracking-[0.4em] pl-[0.4em] text-white/40 mb-2">LENGTH</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {minuteOptions.map((m) => (
                  <Pick key={m} active={minutes === m} onClick={() => setMinutes(m)} big={`${m}`} small="MINUTES" />
                ))}
              </div>
            </>
          )}

          <p className="text-[10px] tracking-[0.4em] pl-[0.4em] text-white/40 mb-2">REPEAT · FOR A LONGER SESSION, WITHOUT STOPPING</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {REPEATS.map((r) => (
              <Pick key={r} active={repeats === r} onClick={() => setRepeats(r)} big={`×${r}`} small={fmt(planSeconds * r)} />
            ))}
          </div>
          <p className="text-xs text-white/40 mb-6 flex items-center gap-2"><Repeat className="w-3.5 h-3.5" /> {repeats === 1 ? 'One pass.' : `${repeats} passes back to back. The circle keeps going; nothing to tap in between.`}</p>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/85">Music</p>
                <p className="text-[11px] text-white/40">{music.enabled ? track.title : 'Off'}</p>
              </div>
              <button type="button" onClick={() => music.toggle()} className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-colors ${music.enabled ? 'border-[#F5A623]/50 bg-[#F5A623]/15 text-[#F5A623]' : 'border-white/15 text-white/50'}`} aria-label={music.enabled ? 'Music on' : 'Music off'}>
                {music.enabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
            </div>
            {music.enabled && (
              <>
                {tracks.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {tracks.map((t) => (
                      <button key={t.id} type="button" onClick={() => pickTrack(t.id)} className={`flex-shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${t.id === track.id ? 'border-[#F5A623]/60 bg-[#F5A623]/10' : 'border-white/10 bg-white/[0.02]'}`}>
                        <p className={`text-xs font-semibold ${t.id === track.id ? 'text-[#FFE2B4]' : 'text-white/75'}`}>{t.title}</p>
                        {t.durationSeconds ? <p className="text-[10px] text-white/35 tabular-nums">{fmt(t.durationSeconds)}</p> : null}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <VolumeX className="w-4 h-4 text-white/35 flex-shrink-0" />
                  <input type="range" min={0} max={100} step={1} value={Math.round(music.volume * 100)} onChange={(e) => music.setVolume(Number(e.target.value) / 100)} aria-label="Volume" className="flex-1 h-1.5 appearance-none rounded-full cursor-pointer accent-[#F5A623]" style={{ background: `linear-gradient(90deg, #F5A623 ${music.volume * 100}%, rgba(255,255,255,.12) ${music.volume * 100}%)` }} />
                  <Volume2 className="w-4 h-4 text-white/35 flex-shrink-0" />
                </div>
              </>
            )}
          </div>

          <Button fullWidth size="lg" onClick={() => startSession(method, minutes, repeats)}>
            <Play className="w-4 h-4" /> Begin
          </Button>

          {method.guided && (
            <div className="pt-6">
              <p className="text-[10px] tracking-[0.4em] pl-[0.4em] text-white/40 mb-2">OR FOLLOW THE GUIDED VERSION</p>
              <GuidedVideo videoId={method.guided.videoId} title={method.guided.title} credit={method.guided.credit} />
            </div>
          )}
        </div>
      )}

      {step === 'session' && method && (
        <div className="fixed inset-0 z-[45] bg-[#040302] flex flex-col items-center justify-between overflow-hidden" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          <CosmicBackdrop drive={size} />
          <div className="relative w-full max-w-lg px-4 flex items-center justify-between">
            <button onClick={requestQuit} className="p-2 rounded-xl text-white/50 hover:text-white transition-colors" aria-label="End session"><X className="w-5 h-5" /></button>
            <p className="text-[11px] font-medium tracking-[0.5em] pl-[0.5em] text-[#FFE2B4]/70">{method.name.toUpperCase()}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => music.toggle(playableUrl(track))} className="p-2 rounded-xl text-white/50 hover:text-white transition-colors" aria-label={music.enabled ? 'Mute music' : 'Play music'}>
                {music.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : music.enabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <button onClick={() => setPaused((p) => !p)} className="p-2 rounded-xl text-white/50 hover:text-white transition-colors" aria-label={paused ? 'Resume' : 'Pause'}>
                {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="relative w-full max-w-[420px] px-6">
            <BreathCircle
              size={size}
              word={word}
              hint={hint}
              sessionProgress={sessionProgress}
              phaseProgress={phaseProgress}
              topLeft={topLeft}
              topRight={topRight}
              tone={tone}
              visible={Math.min(fadeIn, fadeOut)}
              t={now}
            />
          </div>

          <p className="relative text-[11px] tracking-[0.5em] pl-[0.5em] text-[#FFE2B4]/40">WARFARE FITNESS</p>

          <Modal open={quitConfirmOpen} onClose={cancelQuit} title="End this session?">
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">{fmt(left)} left. Quit now?</p>
              <div className="flex gap-3">
                <Button variant="ghost" fullWidth onClick={cancelQuit}>Keep Going</Button>
                <Button variant="danger" fullWidth onClick={confirmQuit}>End Session</Button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {step === 'complete' && method && (
        <div className="relative min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
          <div className="w-full max-w-[300px] mb-2">
            <BreathCircle size={0.4} word="" sessionProgress={1} phaseProgress={0} t={0} />
          </div>
          <p className="text-3xl font-normal tracking-[0.3em] pl-[0.3em] text-[#FFE2B4]">RESET</p>
          <p className="mt-3 text-[11px] tracking-[0.5em] pl-[0.5em] text-white/50">{method.name.toUpperCase()} · {fmt(total)}{repeats > 1 ? ` · ×${repeats}` : ''}</p>
          <p className="mt-6 text-sm text-white/50 max-w-xs leading-relaxed">Come back tomorrow. A few minutes a day is what makes the difference.</p>
          <div className="flex gap-3 w-full max-w-xs mt-8">
            <Button variant="ghost" fullWidth onClick={() => startSession(method, minutes, repeats)}>Again</Button>
            <Button fullWidth onClick={() => { setStep('method'); setMethod(null); }}>Done</Button>
          </div>
        </div>
      )}
      </PaywallGate>
    </div>
  );
}

/**
 * Two soft pools of warm light behind everything, drawn as radial gradients.
 * No blur filter on purpose: a large blurred layer under a fixed element is
 * a known way to make iOS mis-place that element, and it put the bottom nav
 * in the middle of the screen the first time this page shipped.
 */
function CalmBackdrop({ breath = 0.4 }: { breath?: number }) {
  const k = Math.max(0, Math.min(1, (breath - 0.3) / 0.7));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 45%, rgba(214,140,50,.22), rgba(214,140,50,0) 70%)', opacity: 0.5 + k * 0.5, transition: 'opacity .6s linear' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 45% 32% at 55% 55%, rgba(120,70,30,.26), rgba(120,70,30,0) 70%)', opacity: 0.6 + k * 0.2, transition: 'opacity .6s linear' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 65% at 50% 50%, transparent 40%, rgba(0,0,0,.85) 100%)' }} />
    </div>
  );
}

function MiniRing({ featured, ice }: { featured: boolean; ice: boolean }) {
  const c = ice ? '#BFE3FF' : '#FFD9A0'; const g = ice ? '56,189,248' : '245,166,35';
  return (
    <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center">
      <span className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, rgba(${g},.35), transparent 70%)`, opacity: featured ? 1 : 0.6 }} />
      <span className="absolute rounded-full border" style={{ width: 44, height: 44, borderColor: 'rgba(255,255,255,.08)' }} />
      <span className={`rounded-full border-2 ${featured ? 'w-7 h-7 animate-pulse' : 'w-6 h-6'}`} style={{ borderColor: c, boxShadow: `0 0 16px rgba(${g},.6)` }} />
    </div>
  );
}

function Pick({ active, onClick, big, small }: { active: boolean; onClick: () => void; big: string; small: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border px-3 py-4 text-center transition-colors ${active ? 'border-[#F5A623]/60 bg-[#F5A623]/10 shadow-[0_0_30px_rgba(245,166,35,0.15)]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}>
      <p className={`text-2xl font-semibold tabular-nums ${active ? 'text-[#FFE2B4]' : 'text-white/80'}`}>{big}</p>
      <p className="text-[10px] tracking-[0.3em] pl-[0.3em] text-white/40 mt-1 tabular-nums">{small}</p>
    </button>
  );
}
