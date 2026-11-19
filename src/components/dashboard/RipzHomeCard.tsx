'use client';

/**
 * Ripz on the dashboard: one plain card into the Ripz page. The 30-day
 * challenge is offered inside Ripz, for whoever wants it, rather than taking
 * over the home screen.
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export function RipzHomeCard() {
  return (
    <Link href="/ripz/play" className="flex items-center gap-3 p-3 rounded-2xl border border-accent/30 bg-accent/[0.07] wf-rise">
      <span className="w-10 h-12 rounded-md ripz-foil flex items-center justify-center text-[10px] font-black italic text-black/85 -rotate-6">RIPZ</span>
      <span className="flex-1">
        <span className="block text-sm font-black text-white">Ripz</span>
        <span className="block text-xs text-text-secondary">Rip a pack. Do what it deals.</span>
      </span>
      <ChevronRight className="w-4 h-4 text-accent" />
    </Link>
  );
}
