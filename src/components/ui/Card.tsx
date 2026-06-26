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
      className={cn(
        'rounded-2xl',
        glass
          ? 'bg-white/5 backdrop-blur-xl border border-white/10'
          : 'bg-surface border border-white/8',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}
