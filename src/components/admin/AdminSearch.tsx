'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft, Loader2, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchUsers } from '@/lib/firestore';
import type { AdminTabGroup } from './AdminShell';

interface Person { id: string; displayName?: string; email?: string; role?: string }

/**
 * Search across the admin: sections first, then accounts.
 *
 * Sections are matched in memory — there are fifteen of them and they are
 * already on screen, so a keystroke should not cost a request. Accounts go to
 * Firestore through a bounded prefix query, which reads a handful of documents
 * regardless of how many accounts exist. The obvious alternative, loading
 * every user once and filtering here, is the version that quietly stops
 * working somewhere past a few thousand.
 *
 * Selecting an account opens the Clients tab with the term carried over, so
 * the result is visible there rather than the search having merely pointed at
 * a tab and left the finding to be done again by hand.
 */
export function AdminSearch({
  groups,
  onSelect,
}: {
  groups: AdminTabGroup<string>[];
  onSelect: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const tabs = groups.flatMap((g) => g.tabs.map((t) => ({ ...t, group: g.label })));
  const term = q.trim();
  const matchedTabs = term
    ? tabs.filter((t) => t.label.toLowerCase().includes(term.toLowerCase())).slice(0, 6)
    : tabs.slice(0, 6);

  // Cmd/Ctrl+K from anywhere in the admin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQ(''); setPeople([]); setCursor(0); }
  }, [open]);

  // Debounced, and guarded against out-of-order responses: a slow request for
  // "ma" must not overwrite the results already shown for "maril".
  useEffect(() => {
    if (term.length < 2) { setPeople([]); setSearching(false); return; }
    setSearching(true);
    let live = true;
    const t = setTimeout(() => {
      searchUsers(term)
        .then((r) => { if (live) setPeople(r); })
        .catch(() => { if (live) setPeople([]); })
        .finally(() => { if (live) setSearching(false); });
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [term]);

  const results: { key: string; run: () => void; node: React.ReactNode }[] = [
    ...matchedTabs.map((t) => ({
      key: `tab:${t.id}`,
      run: () => { onSelect(t.id); setOpen(false); },
      node: (
        <span className="flex items-center gap-2.5 min-w-0">
          <t.icon className="w-4 h-4 text-text-tertiary flex-shrink-0" strokeWidth={1.75} />
          <span className="text-[13px] text-white truncate">{t.label}</span>
          <span className="text-[11px] text-text-tertiary flex-shrink-0">{t.group}</span>
        </span>
      ),
    })),
    ...people.map((p) => ({
      key: `user:${p.id}`,
      run: () => { router.push(`/admin?tab=clients&q=${encodeURIComponent(p.email || p.displayName || '')}`); setOpen(false); },
      node: (
        <span className="flex items-center gap-2.5 min-w-0">
          <User className="w-4 h-4 text-text-tertiary flex-shrink-0" strokeWidth={1.75} />
          <span className="text-[13px] text-white truncate">{p.displayName || 'Unnamed'}</span>
          <span className="text-[11px] text-text-tertiary truncate">{p.email}</span>
          {p.role && p.role !== 'user' && (
            <span className="text-[10px] font-bold uppercase text-accent flex-shrink-0">{p.role}</span>
          )}
        </span>
      ),
    })),
  ];

  const clamped = Math.min(cursor, Math.max(0, results.length - 1));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 h-9 w-64 px-3 rounded-full bg-surface border border-white/8 text-text-tertiary text-[13px] hover:border-white/20 hover:text-text-secondary transition-colors"
      >
        <Search className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
        <span className="truncate flex-1 text-left">Search</span>
        <kbd className="text-[10px] font-sans border border-white/10 rounded px-1.5 py-0.5 flex-shrink-0">⌘K</kbd>
      </button>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5"
        aria-label="Search"
      >
        <Search className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              role="dialog"
              aria-label="Search the admin"
              className="fixed z-[61] left-1/2 -translate-x-1/2 top-[12vh] w-[min(560px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-surface shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/8">
                <Search className="w-4 h-4 text-text-tertiary flex-shrink-0" strokeWidth={1.75} />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setCursor(0); }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
                    if (e.key === 'Enter') { e.preventDefault(); results[clamped]?.run(); }
                  }}
                  placeholder="Jump to a section, or find someone by name or email"
                  className="flex-1 min-w-0 bg-transparent text-[14px] text-white placeholder:text-text-tertiary focus:outline-none"
                />
                {searching && <Loader2 className="w-4 h-4 text-text-tertiary animate-spin flex-shrink-0" />}
              </div>

              <div className="max-h-[52vh] overflow-y-auto py-1.5">
                {results.length === 0 ? (
                  <p className="px-4 py-6 text-[13px] text-text-tertiary text-center">
                    {term.length < 2
                      ? 'Type at least two characters to search accounts.'
                      : searching ? 'Searching…' : 'Nothing matched.'}
                  </p>
                ) : (
                  results.map((r, i) => (
                    <button
                      key={r.key}
                      onMouseEnter={() => setCursor(i)}
                      onClick={r.run}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === clamped ? 'bg-white/5' : ''
                      }`}
                    >
                      {r.node}
                      {i === clamped && <CornerDownLeft className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />}
                    </button>
                  ))
                )}
              </div>

              {term.length >= 2 && !searching && people.length === 0 && (
                <p className="px-4 py-2.5 border-t border-white/8 text-[11px] text-text-tertiary">
                  Accounts match from the start of an email or name, and names are case-sensitive.
                </p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
