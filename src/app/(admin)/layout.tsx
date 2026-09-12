'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

  // The frame (rail, top bar, back link) is rendered by AdminShell inside the
  // page, so this layout is only the access guard plus the page ground. The
  // old bar duplicated the page heading and pinned the content to 896px,
  // which is what made the dashboard feel like a phone screen on a desktop.
  return <div className="min-h-screen bg-background">{children}</div>;
}
