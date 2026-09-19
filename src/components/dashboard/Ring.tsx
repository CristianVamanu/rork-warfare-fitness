'use client';

/**
 * A progress ring for the home tiles. One SVG, no library: a track circle and
 * a stroke-dasharray arc, rotated so it starts at twelve o'clock.
 *
 * `value` is clamped to 0..1 so an over-target day (water logged past the
 * goal, a program past its last session) draws a full ring rather than
 * wrapping past the start and looking half done.
 */
export function Ring({
  value, size = 56, stroke = 6, color = 'var(--accent)', track = 'var(--progress-track)', children, className = '',
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  /** Rendered dead centre — a number, a unit, an icon. */
  children?: React.ReactNode;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .6s cubic-bezier(.16,1,.3,1)' }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center text-center leading-none">
          {children}
        </div>
      )}
    </div>
  );
}
