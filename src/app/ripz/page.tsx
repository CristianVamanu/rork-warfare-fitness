import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { PublicHeader } from '@/components/landing/PublicHeader';
import { getSystemConfig } from '@/lib/firestore';
import { RIPZ_MOVES, RIPZ_MAX } from '@/lib/ripz';
import { RipzPublic } from './RipzPublic';

type Search = Promise<{ n?: string; m?: string }>;

/** A shared link names the pull, so the preview in a chat shows the number to beat. */
export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const sp = await searchParams;
  const n = Number(sp.n); const move = RIPZ_MOVES.find((m) => m.id === sp.m);
  const shared = move && Number.isInteger(n) && n >= 5 && n <= RIPZ_MAX;
  const title = shared ? `I pulled ${n} ${move.name.toLowerCase()} on Ripz. What do you get?` : 'Ripz: rip a pack, get your challenge';
  const description = `Pick a pack, swipe to rip it open and pick your level and do what it deals: from 5 reps for beginners up to ${RIPZ_MAX} of push-ups, squats, sit-ups, lunges or mountain climbers. Free, no account.`;
  return { title, description, alternates: { canonical: '/ripz' }, openGraph: { title, description, type: 'website' } };
}

export default async function RipzPage() {
  const cfg = await getSystemConfig().catch(() => null);
  const appName = (cfg?.appName as string) || 'Warfare Fitness';
  const logoUrl = (cfg?.logoUrl as string) || null;
  return (
    <div className="min-h-screen bg-background">
      <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[min(1100px,140vw)] h-[600px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgb(var(--accent-rgb) / 0.16), transparent 65%)' }} />
      </div>
      <PublicHeader appName={appName} logoUrl={logoUrl} />
      <main className="relative px-5 py-8">
        {/* useSearchParams needs a boundary for the static shell. */}
        <Suspense fallback={null}><RipzPublic /></Suspense>
      </main>
      <footer className="relative border-t border-white/8 mt-6">
        <div className="max-w-md mx-auto px-5 py-6 space-y-2">
          <p className="text-[11px] text-text-tertiary">General fitness for healthy adults. Stop if anything hurts, and check with a doctor before starting if you have a health condition.</p>
          <div className="flex gap-4">
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
