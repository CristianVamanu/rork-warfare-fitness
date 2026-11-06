import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Glass is the default surface now; pass `solid` for an opaque card. */
  glass?: boolean;
  solid?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function Card({ children, className, glass: glassProp, solid, onClick, style }: CardProps) {
  // Every screen was restyled onto glass one at a time; making it the default
  // brings the remaining pages onto the same surface without touching each.
  const glass = solid ? false : (glassProp ?? true);
  return (
    <div
      onClick={onClick}
      style={style}
      className={cn(
        'rounded-2xl transition-colors',
        glass
          ? 'wf-card'
          : 'bg-surface border border-border',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}
