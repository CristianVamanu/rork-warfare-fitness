'use client';

import { Card } from '@/components/ui/Card';

/**
 * The handful of pieces the redesigned admin screens are built from. Kept
 * deliberately small: a stat tile, a panel with a header row, a segmented
 * control and a status pill. Everything else on an admin screen is either
 * one of these or a plain Card.
 */

export function StatTile({ label, value, caption, delta, loading }: {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  /** A small positive change chip, e.g. "3.1%". Only when there is one. */
  delta?: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-4 lg:p-5 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">{label}</span>
        {delta && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-success/15 text-success">▲ {delta}</span>
        )}
      </div>
      <p className="text-[26px] lg:text-[30px] font-extrabold tracking-tight text-white leading-none tabular-nums">
        {loading ? '—' : value}
      </p>
      {caption && <p className="text-xs text-text-tertiary leading-snug">{caption}</p>}
    </Card>
  );
}

export function Panel({ title, icon: Icon, action, children, className = '', highlight = false }: {
  title?: React.ReactNode;
  icon?: React.ElementType;
  /** Right-hand slot in the header: a pill, a button, a count. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-4 lg:p-5 flex flex-col gap-3.5 min-w-0 ${highlight ? 'border-accent/40 shadow-glow-sm' : ''} ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-sm font-bold text-white flex items-center gap-2 min-w-0">
              {Icon && <Icon className="w-4 h-4 text-accent flex-shrink-0" strokeWidth={1.75} />}
              <span className="truncate">{title}</span>
            </h2>
          )}
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Card>
  );
}

export function Pill({ tone = 'muted', children }: { tone?: 'ok' | 'accent' | 'muted' | 'danger' | 'info'; children: React.ReactNode }) {
  const cls = {
    ok: 'bg-success/15 text-success',
    accent: 'bg-accent-muted text-accent',
    muted: 'bg-white/6 text-text-secondary',
    danger: 'bg-danger/15 text-danger',
    info: 'bg-info/15 text-info',
  }[tone];
  return <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap ${cls}`}>{children}</span>;
}

export function Segmented<T extends string>({ value, onChange, options, className = '' }: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={`inline-flex gap-0.5 p-[3px] rounded-full bg-surface border border-white/8 ${className}`} role="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              on ? 'bg-white text-black' : 'text-text-secondary hover:text-white'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A label/value cell for configuration read-outs. */
export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-surface-elevated min-w-0">
      <span className="text-[11px] text-text-secondary">{k}</span>
      <span className="text-[13px] font-semibold text-white truncate">{v ?? '—'}</span>
    </div>
  );
}
