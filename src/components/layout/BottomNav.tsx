'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutGrid, Activity, Leaf, MessagesSquare, CircleUserRound, House, BarChart3, Users, UserRound } from 'lucide-react';
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

// A floating pill with Training as the raised centre button.
const appItems = [navItems[0], navItems[2], navItems[1], navItems[3], navItems[4]];

// The app nav: Home, Progress, Training (centre), Community, Profile.
// Nutrition is reached from its card on Home.
const appNavItems = [
  { href: '/dashboard', icon: House, label: 'Home' },
  { href: '/progress', icon: BarChart3, label: 'Progress' },
  { href: '/training', icon: Activity, label: 'Training' },
  { href: '/community', icon: Users, label: 'Community' },
  { href: '/profile', icon: UserRound, label: 'Profile' },
];

export function BottomNav() {
  const pathname = usePathname();
  return <AppNav pathname={pathname} />;
}

/** The previous flat bar, kept for reference while the new nav settles. */
export function LegacyBottomNav() {
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

function AppNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 px-3 pb-safe pointer-events-none" aria-label="Main">
      <div
        className="pointer-events-auto mx-auto mb-2 max-w-lg flex items-center justify-around rounded-[28px] px-1.5 h-[68px] backdrop-blur-xl"
        style={{ backgroundColor: 'var(--nav-bg)', border: '1px solid rgba(245,166,35,0.28)', boxShadow: '0 12px 40px rgba(0,0,0,.55), 0 0 22px rgba(245,166,35,0.12), inset 0 1px 0 rgba(255,255,255,0.06)' }}
      >
        {appNavItems.map(({ href, icon: Icon, label }, i) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          if (i === 2) {
            return (
              <Link key={href} href={href} aria-label={label} aria-current={active ? 'page' : undefined} className="relative -mt-9 flex flex-col items-center gap-1">
                {/* Dark core inside a glowing amber ring, amber pulse. */}
                <span className="wf-dark w-[64px] h-[64px] rounded-full flex items-center justify-center active:scale-95 transition-transform"
                  style={{ background: 'radial-gradient(circle at 50% 40%, #241a0e, #0b0a09 72%)', border: '2.5px solid #F5A623', boxShadow: '0 0 0 5px var(--background), 0 0 24px rgba(245,166,35,0.7), inset 0 0 14px rgba(245,166,35,0.3)' }}>
                  <Icon strokeWidth={2.25} className="w-[26px] h-[26px] text-accent" />
                </span>
                <span className="sr-only">{label}</span>
              </Link>
            );
          }
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} className="flex flex-col items-center gap-1 w-16 py-2">
              <Icon strokeWidth={active ? 2.25 : 1.75} className={cn('w-[22px] h-[22px]', active ? 'text-accent' : 'text-foreground/60')} />
              <span className={cn('text-[11px] font-semibold', active ? 'text-accent' : 'text-foreground/60')}>{label}</span>
              <span className={cn('w-1 h-1 rounded-full', active ? 'bg-accent' : 'bg-transparent')} aria-hidden />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
