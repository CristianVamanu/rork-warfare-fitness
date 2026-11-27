'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';

/** Branded player for the landing demo film: no native browser controls, so it
 *  looks the same on every phone and desktop. Tap toggles play; the bar scrubs. */
export function DemoPlayer({ src, poster }: { src: string; poster?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [show, setShow] = useState(true);

  const wake = useCallback(() => {
    setShow(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShow(false), 2600);
  }, []);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    // Autoplay with sound is often refused; fall back to muted so it still starts.
    v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}); });
  }, [src]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
    wake();
  };
  const toggleMute = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    wake();
  };
  const fullscreen = () => {
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    const w = wrap.current;
    if (!v || !w) return;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (w.requestFullscreen) w.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.(); // iPhone only allows the video itself
  };
  const seekAt = (clientX: number) => {
    const v = video.current;
    const b = bar.current;
    if (!v || !b || !dur) return;
    const r = b.getBoundingClientRect();
    v.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * dur;
    setTime(v.currentTime);
    wake();
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const pct = dur ? (time / dur) * 100 : 0;
  const visible = show || !playing;

  return (
    <div
      ref={wrap}
      className="wf-demo-player"
      data-ui={visible ? 'on' : 'off'}
      onMouseMove={wake}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
        else if (e.key === 'ArrowRight' && video.current) { video.current.currentTime += 5; wake(); }
        else if (e.key === 'ArrowLeft' && video.current) { video.current.currentTime -= 5; wake(); }
        else if (e.key === 'm') toggleMute();
        else if (e.key === 'f') fullscreen();
      }}
    >
      <video
        ref={video}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        onClick={toggle}
        onPlay={() => { setPlaying(true); wake(); }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length && v.duration) setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
        }}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
      />

      <button type="button" className="wf-dp-center" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} tabIndex={-1}>
        {playing ? <Pause aria-hidden /> : <Play aria-hidden style={{ marginLeft: '6%' }} />}
      </button>

      <div className="wf-dp-bottom">
        <div
          ref={bar}
          className="wf-dp-bar"
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${fmt(time)} of ${fmt(dur)}`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekAt(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e.clientX); } }}
        >
          <i className="wf-dp-buf" style={{ width: `${buffered}%` }} />
          <i className="wf-dp-fill" style={{ width: `${pct}%` }} />
          <i className="wf-dp-knob" style={{ left: `${pct}%` }} />
        </div>
        <div className="wf-dp-row">
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
          </button>
          <span className="wf-dp-time"><b>{fmt(time)}</b> / {fmt(dur)}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
          </button>
          <button type="button" onClick={fullscreen} aria-label="Full screen">
            <Maximize aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
