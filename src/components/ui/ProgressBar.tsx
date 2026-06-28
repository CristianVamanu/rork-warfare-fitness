'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  color?: 'accent' | 'success' | 'info' | 'danger';
  showLabel?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const colors = {
  accent: 'bg-accent',
  success: 'bg-success',
  info: 'bg-info',
  danger: 'bg-danger',
};

const sizes = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

export function ProgressBar({
  value,
  max = 100,
  className,
  color = 'accent',
  showLabel,
  label,
  size = 'md',
}: ProgressBarProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn('space-y-1', className)}>
      {(showLabel || label) && (
        <div className="flex justify-between text-xs text-text-secondary">
          {label && <span>{label}</span>}
          {showLabel && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div style={{ backgroundColor: 'var(--progress-track)' }} className={cn('w-full rounded-full overflow-hidden', sizes[size])}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={cn('h-full rounded-full', colors[color])}
        />
      </div>
    </div>
  );
}
