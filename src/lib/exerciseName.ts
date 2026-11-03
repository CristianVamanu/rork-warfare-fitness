/**
 * One matching key per lift, so history, the progress chart and the smart
 * suggestions treat "Bench Press", "Barbell Bench Press", "bench press "
 * and "Bench Presses" as the same exercise. Equipment that changes the
 * lift (dumbbell, machine, cable, smith, incline…) is kept; words that do
 * not (barbell as the default, standard, regular, flat, conventional) are
 * dropped. Pure, unit-tested.
 */
const DROP = new Set(['barbell', 'bb', 'standard', 'regular', 'flat', 'conventional', 'traditional', 'the', 'a', 'exercise', 'bodyweight', 'bw']);
const SYN: Record<string, string> = { db: 'dumbbell', dbs: 'dumbbell', dumbell: 'dumbbell', ohp: 'overhead press', rdl: 'romanian deadlift', 'pushup': 'push up', 'pullup': 'pull up', 'chinup': 'chin up', 'situp': 'sit up' };

function singular(w: string): string {
  if (w.length <= 2) return w;
  if (w.endsWith('sses')) return w.slice(0, -2); // presses -> press
  if (w.endsWith('ss') || w.endsWith('us') || w.endsWith('is')) return w; // press, triceps? (see below), abductors handled by s rule
  if (w.endsWith('s')) return w.slice(0, -1); // curls -> curl, raises -> raise
  return w;
}

export function exerciseKey(name: unknown): string {
  const words = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (SYN[w] ?? w).split(' '))
    .map(singular)
    .filter((w) => !DROP.has(w));
  return words.join('');
}

export const sameExercise = (a: unknown, b: unknown) => {
  const ka = exerciseKey(a);
  return ka.length > 0 && ka === exerciseKey(b);
};
