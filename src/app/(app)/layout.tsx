'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { HeaderDataProvider } from '@/contexts/HeaderDataContext';
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
    // A code was just issued at login and hasn't been verified yet — block
    // every other route until it is (or a fresh code is requested and
    // verified), not just whichever screen initiated the check. Without
    // this a signed-in-but-unverified session could reach real data just
    // by navigating directly to another URL instead of following the
    // redirect the login page already gave it.
    if (profile?.twoFactorPendingSince && pathname !== '/verify-2fa') {
      router.replace('/verify-2fa');
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

  // Mirrors the redirect effect's own conditions above — without this, the
  // effect only fires AFTER commit, but React already committed `children`
  // (e.g. the dashboard page) in that same render, and a child's own
  // effects run BEFORE its parent's. That let a still-pending page's data
  // fetches (getTodayMeals, getUserWorkouts, etc.) fire and get correctly
  // denied by firestore.rules' notTfaPending()/banned checks a beat before
  // the redirect actually happened — a real race, seen live as a burst of
  // "Missing or insufficient permissions" errors right before landing on
  // /verify-2fa or /banned. Blocking the render here instead means the
  // gated page's own effects never mount in the first place.
  if (profile.banned && pathname !== '/banned') return <FullPageSpinner />;
  if (profile.twoFactorPendingSince && pathname !== '/verify-2fa') return <FullPageSpinner />;

  const hideNav = pathname === '/banned' || pathname === '/verify-2fa';

  return (
    // No bg-background here — redundant with <body>'s own background-color
    // (same var(--background) token), which is all that's needed as the
    // fallback base paint before/around AppBackground's fixed decorative
    // layer underneath.
    <div className="min-h-screen">
      <AppBackground />
      <HeaderDataProvider>
        <main className="pb-24 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto relative">
          <MembershipGuard pathname={pathname}>{children}</MembershipGuard>
        </main>
      </HeaderDataProvider>
      {!hideNav && <BottomNav />}
      {!hideNav && <PwaInstallBanner />}
    </div>
  );
}
