'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BottomNav } from '@/components/layout/BottomNav';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { PwaInstallBanner } from '@/components/ui/PwaInstallBanner';
import { MembershipGuard } from '@/components/ui/MembershipGuard';
import { AppBackground } from '@/components/ui/AppBackground';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // Redirect new users to onboarding when flag is explicitly false. /onboarding
    // lives outside this route group entirely (it's reachable before signup),
    // so landing here always means leaving this layout, not looping within it.
    // Admins and trainers skip onboarding — they manage the platform.
    // undefined = existing user created before this feature → skip gate.
    if (profile?.banned && pathname !== '/banned') {
      router.replace('/banned');
      return;
    }
    if (
      profile &&
      profile.role !== 'admin' &&
      profile.role !== 'trainer' &&
      profile.onboardingComplete === false
    ) {
      router.replace('/onboarding');
    }
  }, [user, profile, loading, router, pathname]);

  if (loading) return <FullPageSpinner />;
  if (!user) return null;

  if (profile === null) return <FullPageSpinner />;

  const hideNav = pathname === '/banned';

  return (
    // No bg-background here — redundant with <body>'s own background-color
    // (same var(--background) token), which is all that's needed as the
    // fallback base paint before/around AppBackground's fixed decorative
    // layer underneath.
    <div className="min-h-screen">
      <AppBackground />
      <main className="pb-24 max-w-lg mx-auto relative">
        <MembershipGuard pathname={pathname}>{children}</MembershipGuard>
      </main>
      {!hideNav && <BottomNav />}
      {!hideNav && <PwaInstallBanner />}
    </div>
  );
}
