'use client';

/**
 * The small instrument-panel charts used by the app's watch screens
 * ("Tactical HUD" style). Plain SVG, no chart library: they are tiny, need
 * to draw on the first frame and must handle missing days (null) cleanly.
 */
import { useEffect } from 'react';

export const HUD = {
  ground: '#07090B',
  panel: '#0E1216',
  line: '#1C232A',
  fg: '#E9EEF2',
  dim: '#8A96A1',
  faint: '#56616B',
  amber: '#F5A623',
  signal: '#4FE3C1',
  alert: '#FF6B5B',
  ok: '#7BE07B',
} as const;

export const HUD_DISPLAY = "'Chakra Petch', 'Inter', system-ui, sans-serif";
export const HUD_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap';

/** Loads the two HUD faces once, only on screens that use them. */
export function useHudFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-hud-fonts]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT_HREF;
    l.dataset.hudFonts = '1';
    document.head.appendChild(l);
  }, []);
}

/** Readiness ring. `value` 0-100 or null (shows a dashed empty ring). */
export function Ring({ value, size = 96, color = HUD.amber }: { value: number | null; size?: number; color?: string }) {
  const r = size / 2 - 7, c = 2 * Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={value == null ? 'Readiness not available yet' : `Readiness ${value} of 100`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={HUD.line} strokeWidth={7} strokeDasharray={value == null ? '3 5' : undefined} />
      {value != null && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)' }}
        />
      )}
      <text x="50%" y="50%" dy=".35em" textAnchor="middle" fill={HUD.fg} style={{ fontFamily: HUD_DISPLAY, fontWeight: 700, fontSize: size * 0.28 }}>
        {value == null ? '--' : value}
      </text>
    </svg>
  );
}

/**
 * Bars for a daily series. The last bar is today: highlighted, and drawn in
 * `alertLast` colour when it is flagged. `ref` draws a dashed usual line.
 */
export function Bars({ values, height = 34, refValue, alertLast, color = HUD.signal, label }: {
  values: (number | null)[]; height?: number; refValue?: number | null; alertLast?: boolean; color?: string; label: string;
}) {
  const W = 120, n = values.length, gap = n > 14 ? 1.5 : 4, bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, refValue ?? 0, ...values.map(v => v ?? 0)) * 1.08;
  const y = (v: number) => height - (v / max) * height;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label}>
      {values.map((v, i) => {
        const last = i === n - 1;
        if (v == null) return <rect key={i} x={i * (bw + gap)} y={height - 2} width={bw} height={2} fill={HUD.line} />;
        return <rect key={i} x={i * (bw + gap)} y={y(v)} width={bw} height={height - y(v)} rx={Math.min(2, bw / 3)} fill={last ? (alertLast ? HUD.alert : color) : color} opacity={last ? 1 : 0.38} />;
      })}
      {refValue != null && <line x1={0} x2={W} y1={y(refValue)} y2={y(refValue)} stroke={HUD.faint} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Line for a daily series with gaps bridged, a usual band and an end dot. */
export function Line({ values, height = 34, band, alertLast, color = HUD.signal, label, fill = false }: {
  values: (number | null)[]; height?: number; band?: [number, number] | null; alertLast?: boolean; color?: string; label: string; fill?: boolean;
}) {
  const W = 120, pad = 4;
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) {
    return <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={`${label}: not enough data yet`}><line x1={0} x2={W} y1={height / 2} y2={height / 2} stroke={HUD.line} strokeDasharray="3 4" /></svg>;
  }
  let lo = Math.min(...nums, ...(band ?? [])), hi = Math.max(...nums, ...(band ?? []));
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const x = (i: number) => (values.length === 1 ? W / 2 : (i / (values.length - 1)) * W);
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);
  const pts = values.map((v, i) => (v == null ? null : [x(i), y(v)] as const)).filter(Boolean) as [number, number][];
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const end = pts[pts.length - 1];
  const lastIsToday = values[values.length - 1] != null;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label}>
      {band && <rect x={0} y={y(band[1])} width={W} height={Math.max(1, y(band[0]) - y(band[1]))} fill={color} opacity={0.1} />}
      {fill && <path d={`${d} L${end[0]},${height} L${pts[0][0]},${height} Z`} fill={color} opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {lastIsToday && <circle cx={end[0]} cy={end[1]} r={3.2} fill={alertLast ? HUD.alert : color} />}
    </svg>
  );
}

/** Thin goal bar. */
export function Meter({ value, goal, color = HUD.signal }: { value: number | null; goal: number; color?: string }) {
  const pct = value == null ? 0 : Math.min(100, (value / goal) * 100);
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: HUD.line }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 900ms cubic-bezier(.2,.8,.2,1)' }} />
    </div>
  );
}

export function HudLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return <span className="text-[11px] uppercase tracking-[0.14em]" style={{ fontFamily: HUD_MONO, color: color ?? HUD.dim }}>{children}</span>;
}
