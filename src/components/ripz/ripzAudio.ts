/**
 * Ripz sound, synthesised with Web Audio so there is no file to download and
 * nothing to license: foil crackle while the finger drags, a tear and a thump
 * when the pack gives, ticks as the number counts up and a short sting on the
 * reveal. Created on the first touch, because browsers only allow audio to
 * start from a gesture. Every call is a no-op when muted or unsupported.
 */
export class RipzAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private dragGain: GainNode | null = null;
  private dragSrc: AudioBufferSourceNode | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Call from a touch or click so later sounds are allowed to play. */
  unlock() { this.ensure(); }

  /** Finger down: start the (silent) crackle bed. */
  dragStart() {
    const ctx = this.ensure();
    if (!ctx || !this.noise || this.dragSrc) return;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(ctx.destination); src.start();
    this.dragSrc = src; this.dragGain = g;
  }

  /** Finger moving: louder the faster it goes (0..1). */
  dragMove(speed: number) {
    if (!this.ctx || !this.dragGain) return;
    const t = this.ctx.currentTime;
    this.dragGain.gain.cancelScheduledValues(t);
    this.dragGain.gain.setTargetAtTime(Math.min(0.22, 0.04 + speed * 0.3), t, 0.02);
    this.dragGain.gain.setTargetAtTime(0, t + 0.06, 0.05);
  }

  dragEnd() {
    try { this.dragSrc?.stop(); } catch { /* already stopped */ }
    this.dragSrc = null; this.dragGain = null;
  }

  /** The pack gives: tearing noise sweeping up, with a low thump under it. */
  rip() {
    const ctx = this.ensure();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.setValueAtTime(600, t); hp.frequency.exponentialRampToValueAtTime(6000, t + 0.28);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    src.connect(hp).connect(g).connect(ctx.destination); src.start(t); src.stop(t + 0.36);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(og).connect(ctx.destination); o.start(t); o.stop(t + 0.42);
  }

  /** One count-up tick; `k` 0..1 raises the pitch as the number climbs. */
  tick(k: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 520 + k * 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.06);
  }

  /** The number lands. Bigger pulls get a taller chord. */
  sting(level: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [196, 293.66, 392, 587.33].slice(0, 2 + Math.min(2, level));
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.03); g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.03 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(lp).connect(g).connect(ctx.destination); o.start(t + i * 0.03); o.stop(t + 0.95);
    });
  }

  /** Countdown beep: short for 3-2-1, long and higher for GO / time up. */
  beep(go = false) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime; const len = go ? 0.5 : 0.14;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = go ? 1175 : 784;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + len + 0.02);
  }

  close() { this.dragEnd(); void this.ctx?.close(); this.ctx = null; }
}

/** Short buzz where the device supports it (Android browsers, the apps). */
export function buzz(pattern: number | number[]) {
  try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern); } catch { /* unsupported */ }
}
