'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login');
      else if (profile && profile.role !== 'admin') router.replace('/dashboard');
    }
  }, [user, profile, loading, router]);

  // Show spinner while auth loads OR while user is confirmed but profile hasn't arrived yet
  if (loading || (user && !profile)) return <FullPageSpinner />;
  if (!user || !profile || profile.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-white/8 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-danger/20 flex items-center justify-center">
          <span className="text-xs font-black text-danger">A</span>
        </div>
        <span className="text-sm font-bold text-white">Admin Panel</span>
      </div>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
