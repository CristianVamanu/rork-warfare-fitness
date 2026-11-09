'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Loader2, RotateCcw } from 'lucide-react';

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// Custom hero player: autoplays muted, no native browser chrome. Note: no
// crossOrigin attribute — with it, a storage bucket without CORS headers
// makes the browser reject the file and the video spins forever.
export function HeroVideoPlayer({ src, posterUrl }: { src: string; posterUrl?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [showUi, setShowUi] = useState(true);
  const hideT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poke = () => {
    setShowUi(true);
    if (hideT.current) clearTimeout(hideT.current);
    hideT.current = setTimeout(() => setShowUi(false), 2500);
  };

  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => setPlaying(false));
    poke();
    return () => { if (hideT.current) clearTimeout(hideT.current); };
  }, [src]);

  const toggle = () => {
    const v = vid.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    poke();
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = vid.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted && v.paused) v.play().catch(() => {});
    poke();
  };

  const fullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = vid.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (wrap.current?.requestFullscreen) wrap.current.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = vid.current;
    if (!v || !dur) return;
    v.currentTime = (Number(e.target.value) / 1000) * dur;
    setTime(v.currentTime);
    poke();
  };

  const retry = () => {
    const v = vid.current;
    if (!v) return;
    setFailed(false);
    setLoading(true);
    v.load();
    v.play().catch(() => {});
  };

  const pct = dur ? (time / dur) * 100 : 0;

  return (
    <div
      ref={wrap}
      onMouseMove={poke}
      onTouchStart={poke}
      onClick={toggle}
      className="group relative rounded-3xl overflow-hidden border border-white/10 bg-black mx-auto max-w-full w-fit cursor-pointer shadow-[0_20px_60px_-20px_rgba(245,158,11,0.35)]"
    >
      <video
        ref={vid}
        src={src}
        poster={posterUrl}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onPlaying={() => { setLoading(false); setFailed(false); }}
        onError={() => { setFailed(true); setLoading(false); }}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length && v.duration) setBuf((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
        }}
        className="block max-h-[560px] max-w-full w-auto h-auto mx-auto"
      />

      {/* centre state */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {failed ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); retry(); }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 px-4 py-2 text-sm text-white"
          >
            <RotateCcw className="w-4 h-4" /> Video didn&apos;t load · Retry
          </button>
        ) : loading ? (
          <Loader2 className="w-10 h-10 text-amber-400 animate-spin drop-shadow" />
        ) : !playing ? (
          <span className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-500 text-black shadow-[0_0_40px_rgba(245,158,11,0.6)] transition-transform group-hover:scale-105">
            <Play className="w-7 h-7 ml-1 fill-current" />
          </span>
        ) : null}
      </div>

      {/* bottom glass bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute left-3 right-3 bottom-3 rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-3 py-2 flex items-center gap-3 transition-all duration-300 ${
          showUi || !playing ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} className="text-white hover:text-amber-400 transition-colors">
          {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
        </button>
        <div className="relative flex-1 h-1.5 rounded-full bg-white/15">
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${buf}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-400" style={{ width: `${pct}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow"
            style={{ left: `${pct}%` }}
          />
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(pct * 10)}
            onChange={seek}
            aria-label="Seek"
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>
        <span className="text-[11px] tabular-nums text-white/70">{fmt(time)} / {fmt(dur)}</span>
        <button type="button" aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} className="text-white hover:text-amber-400 transition-colors">
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button type="button" aria-label="Fullscreen" onClick={fullscreen} className="text-white hover:text-amber-400 transition-colors">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
