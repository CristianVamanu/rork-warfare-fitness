'use client';

/**
 * "My progress" for the exercise on screen: the heaviest completed set from
 * each of the last sessions that included it, as a smooth line with weight
 * labels and dates. Hidden until there are at least two sessions to compare.
 */
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { getUserWorkouts } from '@/lib/firestore';
import { exerciseProgress, type ProgressPoint } from '@/lib/exerciseProgress';

const W = 300, H = 120, PAD_L = 34, PAD_R = 10, PAD_T = 12, PAD_B = 22;

/** Catmull-Rom through the points, as cubic Béziers: a smooth line that still passes through every session. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function ExerciseProgressCard({ userId, exerciseName, unit }: { userId?: string; exerciseName: string; unit: string }) {
  const [workouts, setWorkouts] = useState<Parameters<typeof exerciseProgress>[0] | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getUserWorkouts(userId, 60)
      .then((rows) => { if (alive) setWorkouts(rows as unknown as Parameters<typeof exerciseProgress>[0]); })
      .catch(() => { if (alive) setWorkouts([]); });
    return () => { alive = false; };
  }, [userId]);

  const pts: ProgressPoint[] = useMemo(() => (workouts ? exerciseProgress(workouts, exerciseName, 8) : []), [workouts, exerciseName]);
  if (pts.length < 2) return null;

  const ws = pts.map((p) => p.weight);
  let lo = Math.min(...ws), hi = Math.max(...ws);
  if (hi === lo) { lo -= 5; hi += 5; }
  const span = hi - lo; lo = Math.max(0, lo - span * 0.15); hi += span * 0.15;
  const x = (i: number) => PAD_L + (i / (pts.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
  const xy = pts.map((p, i) => [x(i), y(p.weight)] as [number, number]);
  const line = smoothPath(xy);
  const area = `${line} L${xy[xy.length - 1][0]},${H - PAD_B} L${xy[0][0]},${H - PAD_B} Z`;
  const ticks = [hi, (hi + lo) / 2, lo].map((v) => Math.round(v));
  const last = pts[pts.length - 1], first = pts[0];
  const change = Math.round((last.weight - first.weight) * 10) / 10;
  const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const labelIdx = pts.length <= 4 ? pts.map((_, i) => i) : [0, Math.floor((pts.length - 1) / 2), pts.length - 1];

  return (
    <div className="mt-3 rounded-2xl p-3.5" style={{ backgroundColor: 'var(--card-glass-bg)', border: '1px solid var(--card-glass-border)' }}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">My progress</span>
          <p className="text-2xl font-black text-accent tabular-nums leading-tight">{last.weight}<span className="text-sm font-semibold ml-0.5">{unit}</span></p>
        </div>
        <span className={`flex items-center gap-1 text-xs font-semibold ${change > 0 ? 'text-success' : 'text-text-tertiary'}`}>
          {change > 0 && <TrendingUp className="w-3.5 h-3.5" />}
          {change > 0 ? '+' : ''}{change} {unit} over {pts.length} sessions
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-1" role="img" aria-label={`${exerciseName}: heaviest set over the last ${pts.length} sessions, from ${first.weight} to ${last.weight} ${unit}`}>
        <defs>
          <linearGradient id="exp-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" strokeDasharray="2 4" />
            <text x={PAD_L - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="9" fill="var(--text-tertiary)">{t}</text>
          </g>
        ))}
        <path d={area} fill="url(#exp-fill)" />
        <path d={line} fill="none" stroke="rgb(var(--accent-rgb))" strokeWidth={2.5} strokeLinecap="round" />
        {xy.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i === xy.length - 1 ? 4.5 : 3} fill={i === xy.length - 1 ? 'rgb(var(--accent-rgb))' : 'var(--background)'} stroke="rgb(var(--accent-rgb))" strokeWidth={2} />
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fontSize="9" fill="var(--text-tertiary)">{fmtDay(pts[i].date)}</text>
        ))}
      </svg>
      <p className="text-[11px] text-text-tertiary">Heaviest set each session · last time {last.weight} {unit} × {last.reps}</p>
    </div>
  );
}
