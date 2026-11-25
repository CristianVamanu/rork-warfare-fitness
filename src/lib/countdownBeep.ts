// Short beeps for the workout timer's get-ready countdown and finish.
// Generated with Web Audio so there are no files to load and it works
// offline. The context must be created or resumed inside a tap (iOS), so
// call primeBeep() from the button handler that starts the countdown.

let ctx: AudioContext | null = null;

export function primeBeep(): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* audio not available: the countdown still works silently */ }
}

function tone(freq: number, seconds: number, when = 0, volume = 0.22): void {
  if (!ctx) return;
  try {
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Fast attack and a smooth release, so the beep does not click.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.03);
  } catch { /* ignore */ }
}

/** One tick per countdown second. */
export const beepTick = () => tone(880, 0.11);
/** Longer, higher tone when the set starts. */
export const beepGo = () => tone(1320, 0.45, 0, 0.28);
/** Two rising tones when the timer finishes. */
export const beepDone = () => { tone(990, 0.16); tone(1480, 0.5, 0.18, 0.28); };
