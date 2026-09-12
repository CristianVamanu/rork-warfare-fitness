'use client';

/**
 * Navigation for the public, indexable pages.
 *
 * Programs is a DROPDOWN rather than a row of links. There are eleven of them
 * and the number grows every time an admin publishes one — putting them in the
 * header directly would wrap the bar on desktop and bury Sign In on mobile.
 * The dropdown keeps one item in the bar however many programs exist.
 *
 * The links inside are real <Link>s, rendered in the markup rather than
 * fetched on hover, so a crawler following this nav finds every program page.
 * A dropdown that only exists after a JavaScript hover is invisible to search
 * — which would defeat the entire point of building these pages.
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, Menu, X as XIcon } from 'lucide-react';

interface Props {
  programs: { name: string; slug: string }[];
  /** Admin-configured branding, passed from the server so it renders on first paint. */
  logoUrl?: string | null;
  appName?: string;
}

export function PublicNav({ programs, logoUrl, appName = 'Warfare Fitness' }: Props) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a dropdown that can only be closed
  // by clicking the trigger again is the kind of thing that traps people on
  // touch devices, where there is no hover to fall out of.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <nav className="max-w-5xl mx-auto px-5 py-5">
      <div className="flex items-center justify-between gap-4">
        {/* Same logo treatment as the landing page — these pages are often a
            visitor's FIRST contact with the brand, arriving from search rather
            than the homepage, so an unbranded header is the worst place to
            save a few bytes. */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden shrink-0 ${logoUrl ? '' : 'bg-accent'}`}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={appName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-black text-black">{appName[0]}</span>
            )}
          </div>
          <span className="text-base font-black text-white tracking-tight">{appName}</span>
        </Link>

        <div className="hidden sm:flex items-center gap-6">
          <Link href="/" className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
            Home
          </Link>

          <div className="relative" ref={wrapRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-haspopup="true"
              className="flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-white transition-colors"
            >
              Programs
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="absolute left-0 top-full mt-2 w-72 max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-surface-elevated shadow-2xl p-2 z-50">
                <Link
                  href="/programs"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 rounded-xl text-sm font-bold text-accent hover:bg-white/5"
                >
                  All Programs →
                </Link>
                <div className="h-px bg-white/8 my-2" />
                {programs.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/programs/${p.slug}`}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 rounded-xl text-sm text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
                  >
                    {p.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link href="/trainers" className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
            For Trainers
          </Link>
          <Link href="/login" className="text-sm font-medium text-white hover:text-accent transition-colors">
            Sign In
          </Link>
        </div>

        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="sm:hidden p-2 -mr-2 text-text-secondary hover:text-white transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="sm:hidden flex flex-col gap-1 mt-4 pb-2 border-t border-white/8 pt-4">
          <Link href="/" className="text-sm font-medium text-text-secondary py-2.5">Home</Link>
          <Link href="/programs" className="text-sm font-bold text-accent py-2.5">All Programs</Link>
          {programs.map((p) => (
            <Link
              key={p.slug}
              href={`/programs/${p.slug}`}
              onClick={() => setMobileOpen(false)}
              className="text-sm text-text-secondary py-2 pl-3 border-l border-white/8"
            >
              {p.name}
            </Link>
          ))}
          <Link href="/trainers" className="text-sm font-medium text-text-secondary py-2.5">For Trainers</Link>
          <Link href="/login" className="text-sm font-bold text-accent py-2.5">Sign In</Link>
        </div>
      )}
    </nav>
  );
}
