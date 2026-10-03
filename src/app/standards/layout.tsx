import type { Metadata } from 'next';
import Link from 'next/link';
import { WHY_GYM_ONLY } from '@/lib/ptStandards';
import { PublicHeader } from '@/components/landing/PublicHeader';
import { getSystemConfig } from '@/lib/firestore';

export const metadata: Metadata = {
  title: { default: 'Military selection standards', template: '%s' },
};

/**
 * The public standards section: one shell for the index and every unit page.
 *
 * The unit pages stay out of the MENU — there are fourteen of them and they
 * are reached from the index or from search, not browsed from a dropdown.
 * The header itself is the normal site one: these pages are where strangers
 * land from search, so they are precisely the visitors who need a way
 * through to the programs and the rest of the site.
 */
export default async function StandardsLayout({ children }: { children: React.ReactNode }) {
  // Read server-side, exactly as the landing page does, so the header shows
  // the admin's actual logo and app name rather than a hardcoded wordmark —
  // and shows it in the first HTML rather than popping in after hydration.
  const cfg = await getSystemConfig().catch(() => null);
  const appName = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = (cfg?.logoUrl as string) || null;

  return (
    <div className="min-h-screen bg-background">
      {/* A quiet ambient field. The rest of the page is dark and dense, so
          this is the only decorative thing on it. */}
      <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[min(1100px,140vw)] h-[600px] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--accent-rgb) / 0.16), transparent 65%)' }}
        />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(rgb(var(--accent-rgb) / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--accent-rgb) / 0.05) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, black, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 55% at 50% 0%, black, transparent 75%)',
          }}
        />
      </div>

      <PublicHeader appName={appName} logoUrl={logoUrl} />

      <main className="relative max-w-3xl mx-auto px-5 py-10 sm:py-14">{children}</main>

      <footer className="relative border-t border-white/8 mt-10">
        <div className="max-w-3xl mx-auto px-5 py-8 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-tertiary">{WHY_GYM_ONLY.heading}</p>
          <p className="text-xs text-text-secondary leading-relaxed">{WHY_GYM_ONLY.body}</p>
          <p className="text-xs text-white font-semibold leading-relaxed">{WHY_GYM_ONLY.caveat}</p>
          <p className="text-[11px] text-text-tertiary pt-2">
            Warfare Fitness is not affiliated with, endorsed by, or connected to any armed force or government.
            Standards are reproduced from published sources for training reference.
          </p>
          <div className="flex gap-4 pt-1">
            <Link href="/" className="text-[11px] text-text-tertiary hover:text-white">Home</Link>
            <Link href="/programs" className="text-[11px] text-text-tertiary hover:text-white">Programs</Link>
            <Link href="/terms" className="text-[11px] text-text-tertiary hover:text-white">Terms</Link>
            <Link href="/privacy" className="text-[11px] text-text-tertiary hover:text-white">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
