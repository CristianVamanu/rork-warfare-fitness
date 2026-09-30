'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { CornerBrackets } from '@/components/landing/chrome';

/**
 * A YouTube video with our own controls.
 *
 * Nothing loads until the poster is tapped, so no third-party request
 * happens on page view. On tap the IFrame API is loaded (through
 * youtube-nocookie.com, which sets no tracking cookie until playback) and
 * the player is created with YouTube's bar, keyboard, related videos and
 * annotations off. What the member sees is the picture and the bar below:
 * play, restart, a scrub bar, the clock, mute. A transparent layer over the
 * frame turns a tap into play/pause instead of YouTube's own hover chrome.
 *
 * The IFrame API script is inserted from our own nonce'd bundle, which the
 * page's strict-dynamic CSP trusts; frame-src already allows the host.
 */
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: Record<string, number> };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YTPlayer {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allow: boolean): void;
  getCurrentTime(): number; getDuration(): number; mute(): void; unMute(): void; isMuted(): boolean;
  getPlayerState(): number; destroy(): void;
}

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  });
  return apiPromise;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function GuidedVideo({ videoId, title, credit }: { videoId: string; title: string; credit?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  useEffect(() => {
    if (!armed) return;
    let alive = true;
    loadApi().then(() => {
      if (!alive || !hostRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        host: 'https://www.youtube-nocookie.com',
        videoId,
        playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, iv_load_policy: 3, fs: 0, origin: window.location.origin },
        events: {
          onReady: (e: { target: YTPlayer }) => { setReady(true); setDur(e.target.getDuration()); e.target.playVideo(); },
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            const S = window.YT!.PlayerState;
            setPlaying(e.data === S.PLAYING);
            if (e.data === S.PLAYING) setDur(e.target.getDuration());
          },
        },
      });
    });
    return () => { alive = false; playerRef.current?.destroy(); playerRef.current = null; };
  }, [armed, videoId]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const p = playerRef.current; if (!p || scrubbing !== null) return;
      try { setT(p.getCurrentTime()); } catch { /* player torn down */ }
    }, 250);
    return () => clearInterval(id);
  }, [ready, scrubbing]);

  const toggle = useCallback(() => {
    const p = playerRef.current; if (!p) return;
    if (playing) p.pauseVideo(); else p.playVideo();
  }, [playing]);

  const seek = (s: number) => { playerRef.current?.seekTo(s, true); setT(s); };
  const toggleMute = () => { const p = playerRef.current; if (!p) return; if (p.isMuted()) { p.unMute(); setMuted(false); } else { p.mute(); setMuted(true); } };

  const shown = scrubbing ?? t;
  const pct = dur > 0 ? (shown / dur) * 100 : 0;

  return (
    <div className="group relative rounded-2xl border border-white/10 bg-black overflow-hidden">
      <CornerBrackets size="w-3.5 h-3.5" />
      <div className="relative aspect-video bg-black">
        {!armed ? (
          <button type="button" onClick={() => setArmed(true)} className="absolute inset-0 w-full h-full text-left" aria-label={`Play ${title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" loading="lazy" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-16 h-16 rounded-full border border-accent/50 bg-accent/20 backdrop-blur-sm flex items-center justify-center shadow-[0_0_40px_rgb(var(--accent-rgb)/0.45)]">
                <Play className="w-7 h-7 text-white ml-1" fill="currentColor" />
              </span>
            </span>
            <span className="absolute left-4 right-4 bottom-3">
              <span className="block text-[10px] font-semibold tracking-[0.28em] uppercase text-accent">Guided · with audio</span>
              <span className="block text-sm font-bold text-white mt-0.5">{title}</span>
            </span>
          </button>
        ) : (
          <>
            <div ref={hostRef} className="absolute inset-0 w-full h-full [&>iframe]:w-full [&>iframe]:h-full" />
            {/* Tap layer: play/pause, and it keeps YouTube's hover chrome from appearing. */}
            <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="absolute inset-0 w-full h-full bg-transparent" />
            {!ready && (
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="w-7 h-7 text-accent animate-spin" />
              </span>
            )}
            {ready && !playing && (
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="w-16 h-16 rounded-full border border-accent/50 bg-black/50 backdrop-blur-sm flex items-center justify-center shadow-[0_0_40px_rgb(var(--accent-rgb)/0.35)]">
                  <Play className="w-7 h-7 text-white ml-1" fill="currentColor" />
                </span>
              </span>
            )}
          </>
        )}
      </div>

      {armed && (
        <div className="relative px-3 pt-2 pb-3 bg-black/60 backdrop-blur-sm border-t border-white/8">
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(dur))}
            step={1}
            value={Math.floor(shown)}
            onChange={(e) => setScrubbing(Number(e.target.value))}
            onPointerUp={() => { if (scrubbing !== null) { seek(scrubbing); setScrubbing(null); } }}
            onKeyUp={() => { if (scrubbing !== null) { seek(scrubbing); setScrubbing(null); } }}
            aria-label="Seek"
            className="w-full h-1.5 appearance-none rounded-full cursor-pointer accent-[var(--accent)]"
            style={{ background: `linear-gradient(90deg, rgb(var(--accent-rgb)) ${pct}%, rgba(255,255,255,.12) ${pct}%)` }}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={toggle} className="w-9 h-9 rounded-lg border border-accent/30 bg-accent/10 text-accent flex items-center justify-center hover:bg-accent/20" aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <button type="button" onClick={() => seek(0)} className="w-9 h-9 rounded-lg border border-white/10 text-text-secondary flex items-center justify-center hover:text-white" aria-label="Restart">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button type="button" onClick={toggleMute} className="w-9 h-9 rounded-lg border border-white/10 text-text-secondary flex items-center justify-center hover:text-white" aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
            <p className="wf-readout text-[11px] font-bold text-white tabular-nums">{fmt(shown)} <span className="text-text-tertiary">/ {fmt(dur)}</span></p>
          </div>
          {credit && <p className="text-[10px] text-text-tertiary mt-2">{credit}</p>}
        </div>
      )}
    </div>
  );
}
