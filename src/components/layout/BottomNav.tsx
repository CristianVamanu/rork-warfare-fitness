'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, Dumbbell, Apple, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/training', icon: Dumbbell, label: 'Training' },
  { href: '/nutrition', icon: Apple, label: 'Nutrition' },
  { href: '/community', icon: Users, label: 'Community' },
  { href: '/profile', icon: User, label: 'Profile' },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{ backgroundColor: 'var(--nav-bg)', borderColor: 'var(--border-subtle)' }}
      className="fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl border-t pb-safe"
    >
      <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
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
                  className={cn(
                    'w-5 h-5 transition-colors',
                    active ? 'text-accent' : 'text-foreground'
                  )}
                />
              </motion.div>
              <span
                className={cn(
                  'text-[10px] font-medium transition-colors',
                  active ? 'text-accent' : 'text-text-tertiary'
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
