import { cn } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

function getInitials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  return (
    <div
      className={cn(
        // `relative` is load-bearing: the photo is absolutely positioned to
        // fill this circle. Without it the image filled the nearest positioned
        // ancestor instead — the sticky app header — and a member's new
        // profile picture rendered as a full-width banner across the top of
        // every screen.
        'relative rounded-full flex items-center justify-center bg-accent-muted text-accent font-bold flex-shrink-0 overflow-hidden',
        sizes[size],
        className
      )}
    >
      {src ? (
        // Plain <img>, not next/image: avatars come from Google, Firebase and
        // R2, and next/image refuses any host not listed in next.config —
        // a member's own upload would have thrown rather than rendered.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || 'User'} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
}
