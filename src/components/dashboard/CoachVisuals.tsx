'use client';

/**
 * The coach report's charts: a radar "score breakdown" and a calorie ring
 * with macro bars. Plain SVG, brand colours, theme-aware text.
 */
import type { ScoreAxis } from '@/lib/weeklyReport';

const AMBER = '#F5A623';

/** Radar of each area's 0-100 score; needs at least 3 areas. */
export function ScoreRadar({ axes }: { axes: ScoreAxis[] }) {
  if (axes.length < 3) return null;
  const W = 340, H = 270, c = W / 2, cy = H / 2 + 4, R = 88, n = axes.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [c + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
  };
  const ring = (f: number) => axes.map((_, i) => pt(i, R * f).join(',')).join(' ');
  const shape = axes.map((x, i) => pt(i, R * Math.max(0.06, x.score / 100)).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="max-w-[360px] mx-auto block" role="img"
      aria-label={`Score breakdown: ${axes.map((a) => `${a.label} ${a.score}`).join(', ')}`}>
      {[1, 0.75, 0.5, 0.25].map((f) => (
        <polygon key={f} points={ring(f)} fill={f === 1 ? 'rgba(245,166,35,0.04)' : 'none'} stroke="var(--border-subtle)" strokeWidth={1} />
      ))}
      {axes.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={c} y1={cy} x2={x} y2={y} stroke="var(--border-subtle)" />; })}
      <polygon points={shape} fill="rgba(245,166,35,0.28)" stroke={AMBER} strokeWidth={2.5} strokeLinejoin="round" />
      {axes.map((x, i) => { const [px, py] = pt(i, R * Math.max(0.06, x.score / 100)); return <circle key={x.key} cx={px} cy={py} r={3.5} fill={AMBER} />; })}
      {axes.map((x, i) => {
        const [lx, ly] = pt(i, R + 18);
        const anchor = Math.abs(lx - c) < 8 ? 'middle' : lx > c ? 'start' : 'end';
        return (
          <g key={x.key}>
            <text x={lx} y={ly - 4} textAnchor={anchor} fontSize="11" fontWeight={700} fill="var(--text-secondary)">{x.label}</text>
            <text x={lx} y={ly + 10} textAnchor={anchor} fontSize="11" fontWeight={800} fill={AMBER}>{x.score}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Calorie ring (average vs target) with protein / fat / carbs bars. */
export function NutritionRing({ kcal, kcalGoal, macros }: {
  kcal: number; kcalGoal: number | null;
  macros: { label: string; value: number | null; goal: number | null; color: string }[];
}) {
  const r = 46, C = 2 * Math.PI * r;
  const pct = kcalGoal ? Math.min(1, kcal / kcalGoal) : 0;
  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0" role="img" aria-label={`${kcal} kcal a day${kcalGoal ? ` of ${kcalGoal}` : ''}`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--progress-track)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={AMBER} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${pct * C} ${C}`} transform="rotate(-90 60 60)" />
        <text x="60" y="57" textAnchor="middle" fontSize="22" fontWeight={900} fill="var(--foreground)">{kcal.toLocaleString()}</text>
        <text x="60" y="75" textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">kcal / day</text>
      </svg>
      <div className="flex-1 min-w-0 space-y-2.5">
        {macros.filter((m) => m.value != null).map((m) => (
          <div key={m.label}>
            <div className="flex justify-between text-[11px]">
              <span className="text-text-secondary font-semibold">{m.label}</span>
              <span className="text-white font-bold tabular-nums">{m.value}{m.goal ? ` / ${m.goal}` : ''} g</span>
            </div>
            <div className="h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: 'var(--progress-track)' }}>
              <div className="h-full rounded-full" style={{ width: `${m.goal ? Math.min(100, (m.value! / m.goal) * 100) : 100}%`, background: m.color }} />
            </div>
          </div>
        ))}
        {kcalGoal ? <p className="text-[11px] text-text-tertiary">Target {kcalGoal.toLocaleString()} kcal</p> : null}
      </div>
    </div>
  );
}
