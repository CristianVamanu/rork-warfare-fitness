'use client';

import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent font-bold shadow-glow-sm',
  secondary:
    'bg-surface-elevated border border-border text-foreground',
  ghost:
    'bg-transparent text-text-secondary',
  danger:
    'bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-xl',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3.5 text-base rounded-2xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading,
      fullWidth,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.01 }}
        style={variant === 'primary' ? { color: 'var(--btn-primary-text, #000)' } :
               variant === 'secondary' ? { color: 'var(--foreground)' } :
               variant === 'ghost' ? { color: 'var(--text-secondary)' } : undefined}
        aria-busy={loading || undefined}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/40',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || loading}
        {...(props as React.ComponentPropsWithoutRef<typeof motion.button>)}
      >
        {/* The spinner sits over the label rather than beside it. Beside it,
            the label jumped sideways the moment loading started, and on iOS
            the old and new positions were both painted for a frame or two —
            seen as a doubled "Save" with a spinner through it. Keeping the
            label in place (invisible) means the button's size and layout
            never change; only what is painted does. */}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <Loader2 className="w-4 h-4 animate-spin" />
          </span>
        )}
        <span className={cn('inline-flex items-center justify-center gap-2', loading && 'invisible')}>{children}</span>
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
