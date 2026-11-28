'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { House, Dumbbell, BarChart3, Utensils, Droplet, Snowflake, Users, UserRound, Settings, LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth';

/**
 * Desktop navigation (1024px and wider): a fixed left rail that takes the
 * place of the floating bottom bar, which is a phone pattern and looked lost
 * on a wide screen. Hidden below 1024px by CSS (.wf-side in globals.css).
 */
const ITEMS = [
  { href: '/dashboard', icon: House, label: 'Dashboard', tour: 'nav-home' },
  { href: '/training', icon: Dumbbell, label: 'My Training', tour: 'nav-training' },
  { href: '/progress', icon: BarChart3, label: 'Progress', tour: 'nav-progress' },
  { href: '/nutrition', icon: Utensils, label: 'Nutrition' },
  { href: '/nutrition#water', icon: Droplet, label: 'Hydration' },
  { href: '/breathing', icon: Snowflake, label: 'Recovery' },
  { href: '/community', icon: Users, label: 'Community', tour: 'nav-community' },
  { href: '/profile', icon: UserRound, label: 'Profile', tour: 'nav-profile' },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <aside className="wf-side" aria-label="Main">
      <Link href="/dashboard" className="wf-side-logo" aria-label="Warfare Fitness home">
        <Image src="/brand/logo-wf.webp" alt="" width={920} height={155} priority className="logo-on-dark" />
        <Image src="/brand/logo-wf-light.webp" alt="" width={920} height={155} className="logo-on-light" />
      </Link>
      <nav>
        {ITEMS.map(({ href, icon: Icon, label, tour }) => {
          const active = !href.includes('#') && (pathname === href || pathname.startsWith(href + '/'));
          return (
            <Link key={href} href={href} data-tour={tour} aria-current={active ? 'page' : undefined} className={active ? 'is-on' : undefined}>
              <Icon aria-hidden strokeWidth={active ? 2.2 : 1.8} /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="wf-side-promo wf-dark" aria-hidden>
        <p>Discipline<br />builds<br /><b>freedom.</b></p>
      </div>
      <div className="wf-side-foot">
        <Link href="/settings"><Settings aria-hidden strokeWidth={1.8} /> Settings</Link>
        <button type="button" onClick={async () => { try { await signOut(); } finally { router.replace('/login'); } }}><LogOut aria-hidden strokeWidth={1.8} /> Logout</button>
      </div>
    </aside>
  );
}
