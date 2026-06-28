import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'danger' | 'info' | 'accent' | 'muted';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: { backgroundColor: 'var(--badge-default-bg)', color: 'var(--foreground)' },
  success: {},
  danger: {},
  info: {},
  accent: {},
  muted: { backgroundColor: 'var(--badge-muted-bg)', color: 'var(--text-secondary)' },
};

const variantClasses: Record<BadgeVariant, string> = {
  default: '',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  accent: 'bg-accent-muted text-accent',
  muted: '',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      style={variantStyles[variant]}
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
