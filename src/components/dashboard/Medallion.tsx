'use client';

/**
 * The feature-tile icon: a lit amber medallion, shared by the PT test,
 * breathing, fasting and days-without tiles so the four read as one family.
 */
export function Medallion({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-accent flex-shrink-0 border border-accent/25 shadow-glow-sm ${className}`}
      style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb) / 0.32), rgba(var(--accent-rgb) / 0.06))' }}
    >
      {children}
    </span>
  );
}
