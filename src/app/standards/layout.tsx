import type { Metadata } from 'next';
import Link from 'next/link';
import { WHY_GYM_ONLY } from '@/lib/ptStandards';

export const metadata: Metadata = {
  title: { default: 'Military selection standards', template: '%s' },
};

/**
 * The public standards section: one shell for the index and every unit page.
 *
 * Deliberately not wired into the main site nav beyond a single link. There
 * are eleven unit pages and they exist for search engines and for people
 * arriving from a video, not to be browsed from a menu — a nav with eleven
 * new entries would bury the things that actually sell.
 */
export default function StandardsLayout({ children }: { children: React.ReactNode }) {
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

      <header className="relative border-b border-white/8">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-black tracking-[0.14em] uppercase text-white">
            Warfare<span className="text-accent">Fitness</span>
          </Link>
          <Link
            href="/onboarding"
            className="text-[13px] font-bold px-4 py-2 rounded-xl bg-accent text-black hover:brightness-110 transition"
          >
            Get your plan
          </Link>
        </div>
      </header>

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
