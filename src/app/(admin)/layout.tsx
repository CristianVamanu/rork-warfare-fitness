'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Home } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { tenantHasAdminAccess } from '@/lib/tenants';
import { BrandSplash } from '@/components/ui/BrandSplash';

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

  if (loading || (user && !profile)) return <BrandSplash />;
  if (!user || !profile || profile.role !== 'admin') return null;
  if (!tenantHasAdminAccess(tenant)) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-white/8 px-4 py-3 flex items-center gap-3 sticky top-0 z-40 bg-background/80 backdrop-blur-xl">
        <div className="w-8 h-8 rounded-lg bg-danger/20 flex items-center justify-center">
          <span className="text-xs font-black text-danger">A</span>
        </div>
        <span className="text-sm font-bold text-white">Admin Panel</span>
        {tenant?.stripe?.subscriptionStatus === 'trialing' && (
          <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
            Trial
          </span>
        )}
        <Link
          href="/dashboard"
          className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          <Home className="w-3.5 h-3.5" /> Home
        </Link>
      </div>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
