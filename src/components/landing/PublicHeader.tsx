'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X as XIcon } from 'lucide-react';

/**
 * The site header for public pages outside the landing page.
 *
 * The standards section used to carry a stripped-down bar — wordmark on the
 * left, one CTA on the right, nothing else. The reasoning was that eleven
 * unit pages would bury the menu. That was the wrong trade: those pages are
 * where people arrive from search, so they are exactly the visitors with no
 * idea what else exists here, and the page gave them one destination. A
 * stranger who lands on "Could you pass Marine Recon?" and wants to see the
 * programs should not have to guess at a URL.
 *
 * Same links and same shape as the landing nav, so moving between the two
 * does not feel like two different websites.
 */

export const PUBLIC_NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/programs', label: 'Programs' },
  { href: '/standards', label: 'Standards' },
  { href: '/download', label: 'Download App' },
  { href: '/trainers', label: 'For Trainers' },
];

export function PublicHeader({ ctaHref = '/onboarding', ctaLabel = 'Get your plan' }: {
  ctaHref?: string;
  ctaLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative border-b border-white/8">
      <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-black tracking-[0.14em] uppercase text-white flex-shrink-0">
          Warfare<span className="text-accent">Fitness</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {PUBLIC_NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden sm:inline text-sm font-medium text-white hover:text-accent transition-colors">
            Sign In
          </Link>
          <Link
            href={ctaHref}
            className="text-[13px] font-bold px-4 py-2 rounded-xl bg-accent text-black hover:brightness-110 transition"
          >
            {ctaLabel}
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden p-2 -mr-2 text-text-secondary hover:text-white transition-colors"
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Plain conditional render, no animation. The landing page's own menu
          animates; this one does not, because an animated height on a menu
          that opens over dense text is the exact thing that was making the
          site feel like it stutters. */}
      {open && (
        <div className="md:hidden border-t border-white/8">
          <div className="max-w-5xl mx-auto px-5 py-3 flex flex-col">
            {PUBLIC_NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-text-secondary hover:text-white transition-colors py-2.5"
              >
                {l.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="text-sm font-bold text-accent py-2.5">
              Sign In
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
