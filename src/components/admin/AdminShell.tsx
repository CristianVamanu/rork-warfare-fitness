'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminSearch } from './AdminSearch';
import { useBranding } from './useBranding';

/**
 * The admin frame: a grouped left rail on desktop, the same list in a
 * slide-in drawer on a phone.
 *
 * Replaces a single horizontally scrolling strip of fifteen tab buttons.
 * Fifteen is too many for a strip — on a laptop the last five were off the
 * edge with no hint they existed, and on a phone the strip scrolled sideways
 * against the page scrolling down. Grouping them by what the admin is doing
 * (running the day, managing the product, growing it, keeping the system
 * up) makes the list scannable, and a rail keeps every tab visible at once
 * on a desktop, which is where admin work actually happens.
 *
 * Tab state stays in the page: the shell only renders whatever `tabs` it is
 * given and reports a selection. Nothing about which tab exists, what it
 * loads or what it shows moves here.
 */
export interface AdminTab<Id extends string = string> {
  id: Id;
  label: string;
  icon: React.ElementType;
  /** Small count rendered beside the label — unresolved support tickets. */
  badge?: number;
}

export interface AdminTabGroup<Id extends string = string> {
  label: string;
  tabs: AdminTab<Id>[];
}

export function AdminShell<Id extends string>({
  groups, active, onSelect, title, subtitle, trial, children,
}: {
  groups: AdminTabGroup<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  title: string;
  subtitle?: string;
  trial?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const brand_ = useBranding();

  // Close the drawer whenever the tab changes — picking one is the reason it
  // was opened — and lock page scroll behind it while it is up.
  useEffect(() => { setOpen(false); }, [active]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const nav = (
    <nav className="flex flex-col gap-5" aria-label="Admin sections">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-text-tertiary">{g.label}</p>
          {g.tabs.map(({ id, label, icon: Icon, badge }) => {
            const on = id === active;
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-2.5 h-10 px-2.5 rounded-xl text-[13px] transition-colors text-left ${
                  on ? 'bg-accent-muted text-accent font-semibold' : 'text-text-secondary hover:text-white hover:bg-white/5 font-medium'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
                <span className="flex-1 truncate">{label}</span>
                {!!badge && badge > 0 && (
                  <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    on ? 'bg-accent text-black' : 'bg-danger text-white'
                  }`}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  // The letter block was a stand-in that outlived its purpose: an admin who
  // has uploaded a logo in Settings should see it here, and the name should be
  // the one they set, not a constant compiled into the frame.
  const brand = (
    <div className="flex items-center gap-2.5 px-2">
      {brand_.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand_.logoUrl}
          alt=""
          className="w-8 h-8 rounded-[10px] object-contain flex-shrink-0 bg-surface-elevated"
        />
      ) : (
        <div className="w-8 h-8 rounded-[10px] bg-accent flex items-center justify-center text-black font-black text-sm flex-shrink-0">
          {brand_.appName.trim().charAt(0).toUpperCase() || 'W'}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[12px] font-extrabold tracking-[0.08em] uppercase text-white leading-tight truncate">{brand_.appName}</p>
        <p className="text-[10px] text-text-tertiary leading-tight">Admin{trial ? ' · trial' : ''}</p>
      </div>
    </div>
  );

  return (
    <div className="lg:flex lg:min-h-screen">
      {/* Desktop rail */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[232px] lg:flex-shrink-0 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto gap-6 px-3.5 py-5 border-r border-white/8 bg-surface/60">
        {brand}
        {nav}
        <Link href="/dashboard" className="mt-auto flex items-center gap-2.5 h-10 px-2.5 rounded-xl text-[13px] text-text-secondary hover:text-white hover:bg-white/5">
          <Home className="w-4 h-4" strokeWidth={1.75} /> Back to app
        </Link>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar: title on both sizes, menu button on phones */}
        <header className="sticky top-0 z-30 flex items-center gap-3 h-16 px-4 lg:px-7 border-b border-white/8 bg-background/80 backdrop-blur-xl">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5"
            aria-label="Open admin menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] lg:text-lg font-extrabold text-white leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-xs text-text-secondary leading-tight truncate">{subtitle}</p>}
          </div>
          <AdminSearch
            groups={groups}
            onSelect={onSelect as (id: string) => void}
          />
          <Link href="/dashboard" className="lg:hidden p-2 -mr-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5" aria-label="Back to app">
            <Home className="w-5 h-5" />
          </Link>
        </header>

        <main className="flex-1 min-w-0 px-4 py-5 lg:px-7 lg:py-6">
          {children}
        </main>
      </div>

      {/* Phone drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] flex flex-col gap-6 px-3.5 py-5 bg-surface border-r border-white/8 overflow-y-auto lg:hidden"
              initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              role="dialog" aria-label="Admin menu"
            >
              <div className="flex items-center justify-between">
                {brand}
                <button onClick={() => setOpen(false)} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5" aria-label="Close menu">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {nav}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
