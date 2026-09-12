'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutGrid, Activity, Leaf, MessagesSquare, CircleUserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

// One icon family, thin strokes, no literal objects (a house, a dumbbell,
// an apple read as clip-art). Active state fills the glyph.
const navItems = [
  { href: '/dashboard', icon: LayoutGrid, label: 'Home' },
  { href: '/training', icon: Activity, label: 'Training' },
  { href: '/nutrition', icon: Leaf, label: 'Nutrition' },
  { href: '/community', icon: MessagesSquare, label: 'Community' },
  { href: '/profile', icon: CircleUserRound, label: 'Profile' },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{ backgroundColor: 'var(--nav-bg)', borderColor: 'var(--border-subtle)' }}
      className="fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl border-t pb-safe"
    >
      <div className="flex items-center justify-around px-2 py-2 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors"
            >
              {active && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute inset-0 bg-accent-muted rounded-xl"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                />
              )}
              <motion.div
                animate={{ scale: active ? 1.1 : 1 }}
                transition={{ duration: 0.2 }}
                className="relative"
              >
                <Icon
                  strokeWidth={active ? 2.25 : 1.75}
                  className={cn(
                    'w-[22px] h-[22px] transition-colors',
                    active ? 'text-accent' : 'text-foreground/80'
                  )}
                  style={active ? { fill: 'rgba(var(--accent-rgb) / 0.18)' } : undefined}
                />
                {active && <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" aria-hidden />}
              </motion.div>
              <span
                className={cn(
                  'text-[10px] font-semibold transition-colors',
                  active ? 'text-accent' : 'text-foreground/80'
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
