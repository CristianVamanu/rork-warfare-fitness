'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BottomNav } from '@/components/layout/BottomNav';
import { FullPageSpinner } from '@/components/ui/Spinner';

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
    // Redirect new users to onboarding when flag is explicitly false.
    // undefined = existing user created before this feature → skip gate.
    if (profile && profile.onboardingComplete === false && pathname !== '/onboarding') {
      router.replace('/onboarding');
    }
  }, [user, profile, loading, router, pathname]);

  if (loading) return <FullPageSpinner />;
  if (!user) return null;

  // While profile is loading for first time, wait before enforcing onboarding redirect
  if (profile === null && pathname !== '/onboarding') return <FullPageSpinner />;

  return (
    <div className="min-h-screen bg-background">
      <main className="pb-24 max-w-lg mx-auto">{children}</main>
      {pathname !== '/onboarding' && <BottomNav />}
    </div>
  );
}
