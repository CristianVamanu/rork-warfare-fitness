'use client';

/**
 * An animated WebGL backdrop for the public pages.
 *
 * Written against the raw WebGL API rather than three.js on purpose. These
 * pages exist to rank in search, and Core Web Vitals are part of that — three
 * would add ~150KB gzipped to a page whose entire job is to load fast for a
 * stranger arriving from Google. This is one vertex shader, one fragment
 * shader and about a hundred lines: a few KB, no dependency, and it draws a
 * single full-screen triangle so there is no geometry to speak of.
 *
 * It degrades in three stages, because a background must never be the reason a
 * page fails to render:
 *
 *   - prefers-reduced-motion → renders one static frame, no animation loop
 *   - no WebGL context      → the CSS gradient underneath simply shows through
 *   - tab hidden            → the loop stops entirely
 *
 * Purely decorative, so it is aria-hidden and sits behind the content with
 * pointer-events disabled.
 */

import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

// Slow-drifting perspective grid with a scanning sweep and vignette — reads as
// tactical without becoming a lava lamp behind the text.
const FRAG = `
precision mediump float;
uniform vec2  u_res;
uniform float u_time;

float grid(vec2 uv, float cells, float w) {
  vec2 g = abs(fract(uv * cells) - 0.5);
  float line = min(g.x, g.y);
  return 1.0 - smoothstep(0.0, w, line);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 c  = uv - 0.5;
  c.x *= u_res.x / u_res.y;

  // Perspective floor: push the grid away toward the horizon.
  float horizon = 0.62;
  float depth   = max(0.0001, horizon - uv.y);
  vec2  gv      = vec2(c.x / depth * 0.35, 0.12 / depth + u_time * 0.035);

  float g = grid(gv, 1.0, 0.06) * smoothstep(horizon, horizon - 0.55, uv.y);

  // A slow sweep travelling up the screen.
  float sweep = smoothstep(0.35, 0.0, abs(fract(u_time * 0.06) * 1.6 - 0.3 - uv.y));

  vec3 accent = vec3(0.96, 0.65, 0.14);   // matches the app's accent
  vec3 col    = accent * (g * 0.16 + sweep * g * 0.30);

  // Vignette, so the centre stays dark enough for white text to sit on.
  col *= 1.0 - smoothstep(0.25, 0.95, length(c));

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
  return sh;
}

export function TacticalBackdrop({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const gl = (canvas.getContext('webgl', { antialias: false, alpha: true, powerPreference: 'low-power' })
      || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    // No context (old device, blocked, software-rendering disabled) — leave the
    // canvas transparent and let the CSS gradient behind it do the work.
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // One triangle that covers the viewport — cheaper than two, and there is
    // nothing else in the scene.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');

    // Cap at 1.5x DPR: a retina phone rendering a full-screen shader at 3x is
    // a lot of fragments for a decorative background, and it shows up as heat.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();

    const draw = (t: number) => {
      gl.uniform1f(uTime, (t - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced && !document.hidden) raf = requestAnimationFrame(draw);
    };

    if (reduced) draw(start);            // a single still frame
    else raf = requestAnimationFrame(draw);

    // Stop burning frames on a tab nobody is looking at.
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!reduced) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* The fallback: visible on its own if WebGL never initialises. */}
      <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.07] via-transparent to-transparent" />
      <canvas ref={ref} className="absolute inset-0 w-full h-full" />
      {/* Fades the effect out before it reaches the content below it. */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
