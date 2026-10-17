'use client';

import { cn } from '@/lib/utils';

/**
 * The app's 2026 form surface: a dark glass cell with a tracked micro-label,
 * an accent hairline that lights up on focus, and room for a large value.
 * Pair with `TechBackdrop` inside modals for the faint grid and bloom.
 */
export function TechField({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label
      className={cn(
        'block rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5 transition-all',
        'focus-within:border-accent/50 focus-within:shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35),0_0_24px_rgb(var(--accent-rgb)/0.12)]',
        className,
      )}
    >
      <span className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[10px] font-semibold tracking-[0.24em] text-text-tertiary uppercase">{label}</span>
        {hint && <span className="text-[10px] text-text-tertiary tabular-nums">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const techInputClass = 'w-full bg-transparent text-white placeholder:text-text-tertiary/70 outline-none tabular-nums';

export function TechBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('absolute inset-0 pointer-events-none opacity-70', className)}
      style={{
        backgroundImage:
          'radial-gradient(90% 50% at 100% 0%, rgb(var(--accent-rgb) / 0.14), transparent 60%),' +
          'linear-gradient(rgb(var(--accent-rgb) / 0.06) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgb(var(--accent-rgb) / 0.06) 1px, transparent 1px)',
        backgroundSize: '100% 100%, 28px 28px, 28px 28px',
      }}
    />
  );
}
