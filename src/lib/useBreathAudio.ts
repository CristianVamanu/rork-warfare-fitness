'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The soundtrack for a breathing session.
 *
 * Plays one audio file on a seamless loop through the Web Audio API, which
 * is the only way to loop an MP3 without the small gap an <audio loop>
 * leaves at the join. Fades in over a few seconds when the session starts,
 * fades out when it ends, pauses with the session, and remembers whether
 * the member wants it on or off.
 *
 * Nothing is fetched until `start()` is called from a tap, so the file is
 * never downloaded by someone who only looked at the method list, and the
 * browser's autoplay rules are satisfied because the context is created
 * inside a user gesture.
 */
const PREF_KEY = 'wf-breath-music';
const FADE_IN_S = 3;
const FADE_OUT_S = 4;

export function useBreathAudio(src: string) {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const enabledRef = useRef(true);

  useEffect(() => {
    try { const v = localStorage.getItem(PREF_KEY); if (v === 'off') { setEnabled(false); enabledRef.current = false; } } catch { /* private mode */ }
  }, []);

  const ensureBuffer = useCallback(async (ctx: AudioContext) => {
    if (bufferRef.current) return bufferRef.current;
    setLoading(true);
    try {
      const res = await fetch(src);
      const data = await res.arrayBuffer();
      bufferRef.current = await ctx.decodeAudioData(data);
      return bufferRef.current;
    } finally { setLoading(false); }
  }, [src]);

  const stopSource = useCallback((fadeSeconds: number) => {
    const ctx = ctxRef.current, g = gainRef.current, s = srcRef.current;
    if (!ctx || !g || !s) return;
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    const node = s;
    srcRef.current = null;
    setTimeout(() => { try { node.stop(); } catch { /* already stopped */ } node.disconnect(); }, fadeSeconds * 1000 + 50);
  }, []);

  /** Begin playback (from a user gesture). Safe to call when already playing. */
  const start = useCallback(async () => {
    if (!enabledRef.current) return;
    if (typeof window === 'undefined') return;
    try {
      if (!ctxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = new Ctx();
        gainRef.current = ctxRef.current.createGain();
        gainRef.current.connect(ctxRef.current.destination);
      }
      const ctx = ctxRef.current, g = gainRef.current!;
      if (ctx.state === 'suspended') await ctx.resume();
      if (srcRef.current) return;
      const buf = await ensureBuffer(ctx);
      if (!enabledRef.current) return;
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      s.connect(g);
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.9, now + FADE_IN_S);
      s.start(now);
      srcRef.current = s;
    } catch { /* no audio: the session still runs */ }
  }, [ensureBuffer]);

  const pause = useCallback(() => { ctxRef.current?.suspend().catch(() => {}); }, []);
  const resume = useCallback(() => { if (enabledRef.current) ctxRef.current?.resume().catch(() => {}); }, []);
  /** Fade out and stop; the context is kept for the next session. */
  const stop = useCallback(() => { ctxRef.current?.resume().catch(() => {}); stopSource(FADE_OUT_S); }, [stopSource]);

  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next; setEnabled(next);
    try { localStorage.setItem(PREF_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
    if (next) void start(); else stopSource(0.6);
  }, [start, stopSource]);

  useEffect(() => () => { try { srcRef.current?.stop(); } catch { /* ignore */ } ctxRef.current?.close().catch(() => {}); }, []);

  return useMemo(() => ({ enabled, loading, start, pause, resume, stop, toggle }), [enabled, loading, start, pause, resume, stop, toggle]);
}
