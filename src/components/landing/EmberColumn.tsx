'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * The rising ember column behind the hero headline.
 *
 * One BufferGeometry drawn twice with additive blending: a wide dim pass for
 * the halo and a tight bright pass for the core. That IS the bloom. An
 * UnrealBloomPass would mean a second render target and a blur chain for a
 * result this gets for the cost of one extra draw call, on a page that is the
 * top of a paid funnel and cannot afford the frame budget.
 *
 * Colour comes from AGE, not height — that is the whole trick. Fire reads as
 * fire because a particle cools as it rises, so the same column is white at
 * the base and deep red at the tip without anything being positioned to make
 * it so. The mid-tone is deliberately the brand accent rather than a generic
 * orange, so this looks like Warfare Fitness burning rather than a fire demo.
 *
 * Simulation runs on the CPU in flat Float32Arrays and only position and age
 * are uploaded each frame; size and colour are derived in the vertex shader,
 * which is what allows per-particle size without a second attribute upload.
 *
 * Deliberately silent on failure. If WebGL is unavailable or the context is
 * lost, the hero simply has no ember column — it is decoration layered over a
 * background that already stands on its own, and a black box would be worse
 * than nothing.
 */

const VERTEX = `
attribute float aAge;
attribute float aSeed;
uniform float uSize;
uniform float uPixelRatio;
varying float vAge;
varying float vSeed;

void main() {
  vAge = aAge;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Embers shrink as they cool. The floor keeps the oldest ones from
  // vanishing into sub-pixel noise, which reads as flicker rather than fade.
  float shrink = mix(1.0, 0.25, vAge * vAge);
  gl_PointSize = uSize * shrink * uPixelRatio * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = `
uniform sampler2D uSprite;
uniform float uOpacity;
varying float vAge;
varying float vSeed;

// The temperature ramp. Near-white at ignition, through the brand ember,
// into deep red, then out. Under additive blending, fading toward black IS
// fading to nothing, so no alpha channel work is needed to make smoke.
vec3 temperature(float a) {
  vec3 white  = vec3(1.000, 0.965, 0.878);
  vec3 yellow = vec3(1.000, 0.788, 0.290);
  vec3 ember  = vec3(0.961, 0.651, 0.137);
  vec3 red    = vec3(0.851, 0.169, 0.043);
  if (a < 0.25) return mix(white,  yellow, a / 0.25);
  if (a < 0.55) return mix(yellow, ember,  (a - 0.25) / 0.30);
  if (a < 0.80) return mix(ember,  red,    (a - 0.55) / 0.25);
  return mix(red, vec3(0.0), (a - 0.80) / 0.20);
}

void main() {
  vec4 sprite = texture2D(uSprite, gl_PointCoord);
  if (sprite.a < 0.01) discard;
  // Brightness falls away before the colour does, so embers die out rather
  // than turning into grey dots drifting off the top of the frame.
  float life = 1.0 - smoothstep(0.55, 1.0, vAge);
  // A little per-particle variance stops the column looking like one object.
  float vary = 0.75 + 0.25 * fract(sin(vSeed * 43758.5453) * 1.0);
  gl_FragColor = vec4(temperature(vAge) * life * vary, 1.0) * sprite.a * uOpacity;
}
`;

/** A soft round sprite, generated rather than shipped as a file. */
function makeSprite(): THREE.Texture | null {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export function EmberColumn({ className = '' }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance' });
    } catch {
      return; // No WebGL. The hero is fine without this.
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.innerWidth < 640;
    const COUNT = mobile ? 4500 : 12000;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.set(0, 4.2, 13);
    camera.lookAt(0, 4.2, 0);

    // ── particle state, flat arrays ───────────────────────────────────────
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const ages = new Float32Array(COUNT);
    const lifespans = new Float32Array(COUNT);
    const seeds = new Float32Array(COUNT);
    const ageAttr = new Float32Array(COUNT);

    /** Spawn across a narrow ellipse, denser in the middle. */
    const spawn = (i: number, startAged: boolean) => {
      // sqrt would spread evenly across the disc; squaring instead pulls
      // mass toward the centre so the column has a hot core and thin edges.
      const r = Math.pow(Math.random(), 2);
      const t = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(t) * r * 3.6;
      positions[i * 3 + 1] = Math.random() * 0.4;
      positions[i * 3 + 2] = Math.sin(t) * r * 1.2;
      velocities[i * 3] = (Math.random() - 0.5) * 0.15;
      velocities[i * 3 + 1] = 1.1 + Math.random() * 1.5;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
      lifespans[i] = 2.2 + Math.random() * 2.6;
      // On the first frame the column is seeded mid-life all the way up, so
      // it opens already burning instead of growing from the floor.
      ages[i] = startAged ? Math.random() * lifespans[i] : 0;
      seeds[i] = Math.random() * 100;
    };
    for (let i = 0; i < COUNT; i++) spawn(i, true);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aAge', new THREE.BufferAttribute(ageAttr, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const sprite = makeSprite();
    const pixelRatio = Math.min(window.devicePixelRatio, 2);

    const makeLayer = (size: number, opacity: number) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uSprite: { value: sprite },
          uSize: { value: size },
          uOpacity: { value: opacity },
          uPixelRatio: { value: pixelRatio },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

    // Two passes over ONE geometry: the halo, then the core on top.
    const halo = makeLayer(0.30, 0.5);
    const core = makeLayer(0.07, 1.0);
    const haloPoints = new THREE.Points(geometry, halo);
    const corePoints = new THREE.Points(geometry, core);
    scene.add(haloPoints, corePoints);

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const ageBuf = geometry.getAttribute('aAge') as THREE.BufferAttribute;

    const step = (dt: number, time: number) => {
      for (let i = 0; i < COUNT; i++) {
        ages[i] += dt;
        if (ages[i] >= lifespans[i]) spawn(i, false);

        const i3 = i * 3;
        const norm = ages[i] / lifespans[i];
        const x = positions[i3], y = positions[i3 + 1], z = positions[i3 + 2];

        // Layered trig, not true noise. Two octaves at different rates is
        // enough for the column to waver and lick; real curl noise costs more
        // than it shows at this particle size.
        const sway =
          Math.sin(y * 0.55 + time * 1.15 + seeds[i]) * 0.42 +
          Math.cos(y * 1.35 - time * 0.85 + seeds[i] * 0.5) * 0.18;
        const drift = Math.cos(y * 0.48 - time * 0.95 + seeds[i]) * 0.16;

        // Rise decays with age: embers launch, then coast and cool.
        const lift = velocities[i3 + 1] * (1.0 - norm * 0.62);

        // Outward spread grows with age, so the plume opens as it climbs.
        const spread = norm * 0.55;
        positions[i3] = x + (velocities[i3] + sway * (0.25 + norm * 0.75) + x * spread) * dt;
        positions[i3 + 1] = y + lift * dt;
        positions[i3 + 2] = z + (velocities[i3 + 2] + drift + z * spread) * dt;

        ageAttr[i] = norm;
      }
      posAttr.needsUpdate = true;
      ageBuf.needsUpdate = true;
    };

    // ── the loop, and every reason to stop it ─────────────────────────────
    let raf = 0;
    let running = false;
    let onScreen = true;
    let last = performance.now();
    const clock = { t: 0 };

    const frame = () => {
      const now = performance.now();
      // Clamped: a backgrounded tab or a long task would otherwise hand us a
      // multi-second delta and teleport every particle out of frame.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clock.t += dt;
      step(dt, clock.t);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    if (reduced) {
      // One composed frame: the column exists, it just does not move.
      step(0.016, 0);
      renderer.render(scene, camera);
    } else {
      start();
    }

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (onScreen) start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const io = new IntersectionObserver(
      ([e]) => {
        onScreen = e.isIntersecting;
        if (onScreen && !document.hidden) start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(host);

    const onResize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (reduced) renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    const onLost = (e: Event) => { e.preventDefault(); stop(); };
    renderer.domElement.addEventListener('webglcontextlost', onLost);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      io.disconnect();
      ro.disconnect();
      geometry.dispose();
      halo.dispose();
      core.dispose();
      sprite?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden className={className} />;
}

export default EmberColumn;
