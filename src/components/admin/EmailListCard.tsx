'use client';

import { useCallback, useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Mail, Download, Copy, Trash2, ShieldCheck, ShieldOff, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { deleteLandingLead } from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { LEAD_SOURCE_LABELS, type LeadRow, type LeadSource } from '@/lib/leads';

/**
 * Every collected email, paged, with a CSV export that covers all of them.
 *
 * Three forms feed this list (landing exit-intent, standards test, free
 * plan) and only two of them ask for marketing consent. The list shows the
 * consent state per address and the export defaults to opted-in only, so
 * the file an admin uploads to a mailing tool is the one they are allowed
 * to send to. The full list is one filter away for record-keeping.
 *
 * Paged from the server by cursor rather than sliced in the browser: the
 * old card read the newest 300 and stopped, which for a marketing list is
 * the wrong 300 to be missing.
 */

const PAGE_SIZES = [20, 40, 60, 100] as const;
type Consent = 'all' | 'opted-in' | 'opted-out';

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function EmailListCard() {
  const { user } = useAuth();
  const [perPage, setPerPage] = useState<number>(20);
  const [source, setSource] = useState<LeadSource | 'all'>('all');
  const [consent, setConsent] = useState<Consent>('all');
  // cursors[i] is the `after` id that fetches page i+1; page 1 has none.
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [items, setItems] = useState<LeadRow[] | null>(null);
  const [nextAfter, setNextAfter] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchPage = useCallback(async (after: string | null) => {
    if (!user) return;
    setItems(null);
    try {
      const token = await getIdToken(user);
      const params = new URLSearchParams({ limit: String(perPage), source, consent });
      if (after) params.set('after', after);
      const res = await fetch(`/api/admin/leads?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const data = await res.json() as { items: LeadRow[]; nextAfter: string | null };
      setItems(data.items);
      setNextAfter(data.nextAfter);
    } catch {
      setItems([]);
      toast.error('Could not load the email list');
    }
  }, [user, perPage, source, consent]);

  // Any filter change starts again from page one.
  useEffect(() => {
    setCursors([null]);
    setPageIndex(0);
    fetchPage(null);
  }, [fetchPage]);

  function goNext() {
    if (!nextAfter) return;
    const next = pageIndex + 1;
    setCursors((c) => { const copy = c.slice(0, next); copy[next] = nextAfter; return copy; });
    setPageIndex(next);
    fetchPage(nextAfter);
  }

  function goPrev() {
    if (pageIndex === 0) return;
    const prev = pageIndex - 1;
    setPageIndex(prev);
    fetchPage(cursors[prev]);
  }

  async function exportCsv(which: Consent) {
    if (!user) return;
    setExporting(true);
    try {
      const token = await getIdToken(user);
      const params = new URLSearchParams({ format: 'csv', source, consent: which });
      const res = await fetch(`/api/admin/leads?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'emails.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      toast.success(which === 'opted-in' ? 'Exported: opted-in addresses only' : 'Exported');
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  }

  async function copyEmail(email: string) {
    try { await navigator.clipboard.writeText(email); toast.success('Copied'); }
    catch { toast.error('Could not copy'); }
  }

  async function remove(row: LeadRow) {
    if (!confirm(`Delete ${row.email}? This cannot be undone.`)) return;
    setBusyId(row.id);
    try {
      await deleteLandingLead(row.id);
      setItems((ls) => ls?.filter((l) => l.id !== row.id) ?? null);
      toast.success('Deleted');
    } catch { toast.error('Could not delete it'); }
    finally { setBusyId(null); }
  }

  const selectCls = 'bg-surface border border-white/10 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-accent/50';

  return (
    <Card className="p-4 lg:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-accent text-black flex items-center justify-center flex-shrink-0">
              <Mail className="w-3.5 h-3.5" />
            </span>
            Collected emails
          </h2>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            Every address left on the landing page, the standards test and the free plan. The export is opted-in only unless you choose otherwise — that is the list you can legally send campaigns to.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" onClick={() => exportCsv('opted-in')} loading={exporting}>
            <Download className="w-3.5 h-3.5" /> Export opted-in
          </Button>
          <Button size="sm" variant="ghost" onClick={() => exportCsv('all')} disabled={exporting}>
            All
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value as LeadSource | 'all')} className={selectCls}>
          <option value="all">All sources</option>
          {(Object.keys(LEAD_SOURCE_LABELS) as LeadSource[]).map((s) => <option key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</option>)}
        </select>
        <select aria-label="Consent" value={consent} onChange={(e) => setConsent(e.target.value as Consent)} className={selectCls}>
          <option value="all">Any consent</option>
          <option value="opted-in">Opted in to marketing</option>
          <option value="opted-out">Not opted in</option>
        </select>
        <select aria-label="Emails per page" value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className={`${selectCls} ml-auto`}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {items === null ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-xs text-text-tertiary py-4 text-center">{pageIndex === 0 ? 'Nothing collected yet for this filter.' : 'No more.'}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li key={row.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2.5">
              {/* Opted-in addresses get the lit corner, same as members in
                  the client list: the ones you can write to stand out. */}
              {row.marketingOptIn && <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />}
              <div aria-hidden className="wf-dots pointer-events-none absolute inset-0 opacity-60" />
              <div className="relative flex items-center gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${row.marketingOptIn ? 'bg-gradient-accent text-black shadow-glow-sm' : 'border border-white/10 bg-surface text-text-tertiary'}`}>
                  {row.marketingOptIn ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{row.email}</p>
                  <p className="text-[11px] text-text-tertiary truncate">
                    {LEAD_SOURCE_LABELS[row.source]} · {fmtDate(row.createdAt)}
                    {row.programName && <> · <span className="text-accent">{row.programName}{row.dripActive ? ', drip running' : ''}</span></>}
                  </p>
                </div>
                {row.dripActive && <Sparkles className="w-3.5 h-3.5 text-accent flex-shrink-0 hidden sm:block" aria-label="Drip running" />}
                <button onClick={() => copyEmail(row.email)} className="p-2 rounded-lg text-text-tertiary hover:text-white hover:bg-white/5 transition-colors flex-shrink-0" aria-label={`Copy ${row.email}`} title="Copy">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={() => remove(row)} disabled={busyId === row.id} className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0 disabled:opacity-40" aria-label={`Delete ${row.email}`} title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(pageIndex > 0 || nextAfter) && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <Button size="sm" variant="ghost" disabled={pageIndex === 0 || items === null} onClick={goPrev}>Previous</Button>
          <p className="text-xs text-text-secondary tabular-nums">
            Page {pageIndex + 1}
            {items && <span className="text-text-tertiary"> · {items.length} on this page</span>}
          </p>
          <Button size="sm" variant="ghost" disabled={!nextAfter || items === null} onClick={goNext}>Next</Button>
        </div>
      )}
    </Card>
  );
}
