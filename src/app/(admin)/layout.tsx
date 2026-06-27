'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { tenantHasAdminAccess } from '@/lib/tenants';
import { FullPageSpinner } from '@/components/ui/Spinner';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, tenant, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (profile && profile.role !== 'admin') { router.replace('/dashboard'); return; }
    if (profile && !tenantHasAdminAccess(tenant)) {
      router.replace('/subscription-required');
    }
  }, [user, profile, tenant, loading, router]);

  // Spinner while auth loads or while user is confirmed but profile hasn't arrived yet
  if (loading || (user && !profile)) return <FullPageSpinner />;
  if (!user || !profile || profile.role !== 'admin') return null;
  if (!tenantHasAdminAccess(tenant)) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-white/8 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-danger/20 flex items-center justify-center">
          <span className="text-xs font-black text-danger">A</span>
        </div>
        <span className="text-sm font-bold text-white">Admin Panel</span>
        {tenant?.stripe?.subscriptionStatus === 'trialing' && (
          <span className="ml-auto text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
            Trial
          </span>
        )}
      </div>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
