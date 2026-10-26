'use client';

import { useEffect, useRef } from 'react';

/**
 * A slow drift through space behind a breathing session.
 *
 * Stars stream gently outward from a point just above centre, so it reads
 * as moving forward; the speed follows the breath (`drive`), a little
 * quicker on the inhale and settling on the exhale. A faint warm nebula and
 * a thin perspective grid fading to the horizon give it the instrument feel
 * of the rest of the screen without pulling the eye from the circle.
 *
 * Cost is kept deliberately small: one 2D canvas, a few hundred points, at
 * most 30 frames a second, pixel ratio capped at 1.5, nothing drawn while
 * the tab is hidden, and a single still frame when the device asks for
 * reduced motion. It mounts only on the session screen, so no other page
 * pays for it.
 */
export function CosmicBackdrop({ drive = 0.4, className = '' }: { drive?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const driveRef = useRef(drive);
  useEffect(() => { driveRef.current = drive; }, [drive]);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) return;
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(1.5, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    let w = 0, h = 0, cx = 0, cy = 0;

    type Star = { x: number; y: number; z: number; tw: number };
    const N = 260;
    const stars: Star[] = [];
    const seed = (s: Star) => { s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; s.z = 0.15 + Math.random() * 0.85; s.tw = Math.random() * 6.28; };
    for (let i = 0; i < N; i++) { const s = { x: 0, y: 0, z: 0, tw: 0 }; seed(s); stars.push(s); }

    // Sized from the parent, never from the canvas itself: measuring the
    // canvas would feed its own backing-store size back into the next
    // measurement and grow without bound wherever its CSS size is missing.
    const host = canvas.parentElement ?? canvas;
    const resize = () => {
      const cw = Math.max(1, host.clientWidth), ch = Math.max(1, host.clientHeight);
      const nw = Math.floor(cw * dpr), nh = Math.floor(ch * dpr);
      if (nw === w && nh === h) return;
      w = nw; h = nh; canvas.width = w; canvas.height = h; cx = w / 2; cy = h * 0.46;
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro?.observe(host);

    let raf = 0, last = performance.now(), acc = 0, t = 0;
    const FRAME = 1000 / 30;
    const draw = (dt: number) => {
      t += dt;
      const k = Math.max(0, Math.min(1, (driveRef.current - 0.3) / 0.7));
      const speed = (0.035 + k * 0.07) * dt;
      // space
      ctx.fillStyle = '#040302'; ctx.fillRect(0, 0, w, h);
      const neb = ctx.createRadialGradient(cx + Math.sin(t * 0.05) * w * 0.08, cy + Math.cos(t * 0.04) * h * 0.05, 0, cx, cy, Math.max(w, h) * 0.75);
      neb.addColorStop(0, `rgba(214,140,50,${0.10 + k * 0.08})`); neb.addColorStop(0.45, 'rgba(120,70,30,0.08)'); neb.addColorStop(1, 'rgba(4,3,2,0)');
      ctx.fillStyle = neb; ctx.fillRect(0, 0, w, h);
      // horizon grid, perspective lines fading up to the vanishing point
      const hy = h * 0.78; ctx.lineWidth = 1 * dpr;
      for (let i = -6; i <= 6; i++) {
        const g = ctx.createLinearGradient(cx, cy, cx + i * w * 0.4, h);
        g.addColorStop(0, 'rgba(255,217,160,0)'); g.addColorStop(1, 'rgba(255,217,160,0.10)');
        ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + i * w * 0.4, h); ctx.stroke();
      }
      for (let j = 1; j <= 7; j++) {
        const f = ((j / 7 + t * 0.012 * (0.5 + k)) % 1); const y = cy + (hy - cy) * f * f * 1.6; if (y > h) continue;
        ctx.strokeStyle = `rgba(255,217,160,${0.03 + f * 0.08})`; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // stars, streaming outward from the vanishing point
      for (const s of stars) {
        s.z -= speed * 0.9;
        if (s.z <= 0.05) { seed(s); s.z = 1; }
        const px = cx + (s.x / s.z) * w * 0.5, py = cy + (s.y / s.z) * h * 0.5;
        if (px < -10 || px > w + 10 || py < -10 || py > h + 10) { seed(s); s.z = 1; continue; }
        const size = (1 - s.z) * 2.2 * dpr + 0.3;
        const a = (1 - s.z) * (0.55 + 0.45 * Math.sin(t * 0.9 + s.tw)) * (0.45 + k * 0.55);
        ctx.fillStyle = `rgba(255,228,190,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, size, 0, 6.283); ctx.fill();
        if (s.z < 0.35) { // a short trail on the nearest stars gives the sense of motion
          const tx = cx + (s.x / (s.z + speed * 3)) * w * 0.5, ty = cy + (s.y / (s.z + speed * 3)) * h * 0.5;
          ctx.strokeStyle = `rgba(255,228,190,${(a * 0.35).toFixed(3)})`; ctx.lineWidth = size * 0.8; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
        }
      }
      // vignette so the edges stay dark and the circle owns the middle
      const v = ctx.createRadialGradient(cx, h * 0.5, Math.min(w, h) * 0.25, cx, h * 0.5, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    };

    if (reduced) { draw(0.016); return () => { ro?.disconnect(); }; }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - last; last = now; acc += dt;
      if (acc < FRAME) return;
      const step = Math.min(0.1, acc / 1000); acc = 0;
      if (document.hidden) return;
      draw(step);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />;
}
