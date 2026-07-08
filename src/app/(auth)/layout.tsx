'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) return <FullPageSpinner />;
  if (user) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
