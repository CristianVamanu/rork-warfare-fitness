import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glass?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, glass, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={glass ? { backgroundColor: 'var(--card-glass-bg)', borderColor: 'var(--card-glass-border)' } : undefined}
      className={cn(
        'rounded-2xl transition-colors',
        glass
          ? 'backdrop-blur-xl border'
          : 'bg-surface border border-border',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}
