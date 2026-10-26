'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The soundtrack for a breathing session.
 *
 * Plays through an <audio> element routed into the Web Audio API. The
 * element is what makes the sound: on iPhone, plain Web Audio buffers are
 * silenced by the ring/silent switch, while media elements play through it
 * the way a music app does. The first version of this hook used a buffer
 * and nobody with the switch on silent heard anything. The Web Audio part
 * is only there for the gain node, which gives a volume control that works
 * on iOS (where an element's own `volume` is read-only) and lets the track
 * fade in when the session starts and fade out when it ends.
 *
 * Nothing loads until `start()` is called from a tap, so the file is never
 * downloaded by someone who only looked at the method list, and autoplay
 * rules are satisfied because everything is created inside the gesture.
 */
const PREF_ON = 'wf-breath-music';
const PREF_VOL = 'wf-breath-volume';
const FADE_IN_S = 3;
const FADE_OUT_S = 4;

export function useBreathAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const elRef = useRef<HTMLAudioElement | null>(null);
  const srcRef = useRef<string>('');
  const playingRef = useRef(false);
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolumeState] = useState(0.8);
  const [loading, setLoading] = useState(false);
  const enabledRef = useRef(true);
  const volumeRef = useRef(0.8);

  useEffect(() => {
    try {
      if (localStorage.getItem(PREF_ON) === 'off') { setEnabled(false); enabledRef.current = false; }
      const v = Number(localStorage.getItem(PREF_VOL));
      if (Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem(PREF_VOL) !== null) { setVolumeState(v); volumeRef.current = v; }
    } catch { /* private mode */ }
  }, []);

  const ensureGraph = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctx();
      gainRef.current = ctxRef.current.createGain();
      gainRef.current.gain.value = 0;
      gainRef.current.connect(ctxRef.current.destination);
      const el = new Audio();
      el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
      (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      ctxRef.current.createMediaElementSource(el).connect(gainRef.current);
      elRef.current = el;
    }
    return ctxRef.current;
  }, []);

  const rampTo = useCallback((v: number, seconds: number) => {
    const ctx = ctxRef.current, g = gainRef.current; if (!ctx || !g) return;
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(v, now + seconds);
  }, []);

  /** Begin playing `src` (from a user gesture). Switches track if a different one is playing. */
  const start = useCallback(async (src: string) => {
    if (!enabledRef.current || !src) return;
    try {
      const ctx = ensureGraph(); const el = elRef.current; if (!ctx || !el) return;
      if (ctx.state === 'suspended') await ctx.resume();
      if (srcRef.current !== src) { el.src = src; srcRef.current = src; el.load(); }
      setLoading(true);
      await el.play();
      playingRef.current = true;
      rampTo(volumeRef.current, FADE_IN_S);
    } catch { /* no audio: the session still runs */ }
    finally { setLoading(false); }
  }, [ensureGraph, rampTo]);

  const pause = useCallback(() => { elRef.current?.pause(); }, []);
  const resume = useCallback(() => { if (enabledRef.current && playingRef.current) { ctxRef.current?.resume().catch(() => {}); elRef.current?.play().catch(() => {}); } }, []);

  /** Fade out, then stop. */
  const stop = useCallback(() => {
    const el = elRef.current; if (!el || !playingRef.current) return;
    playingRef.current = false;
    ctxRef.current?.resume().catch(() => {});
    rampTo(0, FADE_OUT_S);
    setTimeout(() => { if (!playingRef.current) { el.pause(); el.currentTime = 0; } }, FADE_OUT_S * 1000 + 50);
  }, [rampTo]);

  const setVolume = useCallback((v: number) => {
    const c = Math.max(0, Math.min(1, v));
    volumeRef.current = c; setVolumeState(c);
    try { localStorage.setItem(PREF_VOL, String(c)); } catch { /* ignore */ }
    if (playingRef.current) rampTo(c, 0.15);
  }, [rampTo]);

  /** Toggle music on/off; when turning on mid-session, pass the track to start. */
  const toggle = useCallback((src?: string) => {
    const next = !enabledRef.current;
    enabledRef.current = next; setEnabled(next);
    try { localStorage.setItem(PREF_ON, next ? 'on' : 'off'); } catch { /* ignore */ }
    if (next) { if (src) void start(src); }
    else { rampTo(0, 0.5); setTimeout(() => { if (!enabledRef.current) { elRef.current?.pause(); playingRef.current = false; } }, 550); }
  }, [start, rampTo]);

  useEffect(() => () => { try { elRef.current?.pause(); } catch { /* ignore */ } ctxRef.current?.close().catch(() => {}); }, []);

  return useMemo(() => ({ enabled, volume, loading, start, pause, resume, stop, toggle, setVolume }), [enabled, volume, loading, start, pause, resume, stop, toggle, setVolume]);
}
