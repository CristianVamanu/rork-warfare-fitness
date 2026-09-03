'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BrandSplash } from '@/components/ui/BrandSplash';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) return <BrandSplash />;
  if (user) return null;

  return (
    <div className="relative isolate min-h-screen bg-background flex items-center justify-center px-4 overflow-hidden">
      {/* Grid texture behind the card.
          The first version radially masked the grid so it faded out before
          the card — but the mask's own ellipse edge was visible as a bright
          patch floating in the middle of an otherwise black page, which read
          as a rendering artifact rather than texture. It now covers the full
          viewport evenly at a lower opacity, with a dark wash over the top so
          it sits behind the content instead of competing with it. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
        {/* Darkens the whole surface and deepens toward the edges, so the
            grid never reads as brighter than the card sitting on it. */}
        <div className="absolute inset-0 bg-background/40" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,transparent_0%,rgba(0,0,0,0.55)_100%)]" />
        <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] rounded-full bg-accent/[0.07] blur-3xl" />
      </div>
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}
