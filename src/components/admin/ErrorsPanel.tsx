'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { AlertTriangle, RefreshCw, Check, RotateCcw, ChevronDown, Globe, Monitor, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * The errors the app reports about itself.
 *
 * /api/client-error has been collecting these into `errorReports` and the
 * nightly digest has been emailing them out, and the email says "resolve
 * them from the admin panel" — pointing at a screen that did not exist. The
 * only way to read a stack trace was to open Firestore directly, and the
 * only way to clear one was to hand-craft a POST with a bearer token.
 *
 * Grouped by fingerprint, so one bug that happened forty times is one row
 * with a count rather than forty rows. Resolving hides it until it happens
 * again, which is what makes the digest meaningful: an empty list is then a
 * real signal instead of a list nobody can act on.
 */

interface ErrorGroup {
  fingerprint: string;
  message: string;
  stack: string | null;
  kind: string;
  count: number;
  lastUrl: string | null;
  lastUserAgent: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  resolved: boolean;
}

/** "3 minutes ago" — an absolute timestamp is no use for judging whether a bug is live. */
function ago(iso: string | null): string {
  if (!iso) return 'unknown';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 90) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * The half of a user agent string worth reading at a glance.
 *
 * A bug that only happens on one browser is a different bug, and that fact
 * is buried in 140 characters of boilerplate every UA string carries.
 */
function browser(ua: string | null): string | null {
  if (!ua) return null;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux' : null;
  const app = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : null;
  return [app, os].filter(Boolean).join(' · ') || null;
}

export function ErrorsPanel() {
  const { user } = useAuth();
  const [errors, setErrors] = useState<ErrorGroup[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (includeResolved: boolean) => {
    if (!user) return;
    setRefreshing(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch(`/api/admin/errors${includeResolved ? '?includeResolved=1' : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      // The route says WHY it failed (a missing composite index reads as an
      // empty list otherwise, which looks like good news). Show its words.
      if (!res.ok) throw new Error(data.error || 'Could not load errors');
      setErrors(data.errors ?? []);
    } catch (err) {
      setErrors([]);
      toast.error(err instanceof Error ? err.message : 'Could not load errors');
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { void load(showResolved); }, [load, showResolved]);

  async function setResolved(group: ErrorGroup, resolved: boolean) {
    if (!user) return;
    setBusy(group.fingerprint);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/errors', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: group.fingerprint, resolved }),
      });
      if (!res.ok) throw new Error('Request failed');
      // Drop it from the list when resolving while resolved ones are hidden;
      // otherwise just flip the flag in place so the row stays put.
      setErrors((list) => (list ?? []).flatMap((e) => {
        if (e.fingerprint !== group.fingerprint) return [e];
        if (resolved && !showResolved) return [];
        return [{ ...e, resolved }];
      }));
      toast.success(resolved ? 'Marked resolved' : 'Reopened');
    } catch {
      toast.error('Could not update it');
    } finally {
      setBusy(null);
    }
  }

  const unresolved = (errors ?? []).filter((e) => !e.resolved).length;

  return (
    <Card className="p-4 lg:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-accent" /> Errors
            {unresolved > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent text-black">{unresolved}</span>
            )}
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Reported by the app itself, grouped so one bug is one row however often it happened.
            This is what the nightly email is counting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => load(showResolved)} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {errors === null ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : errors.length === 0 ? (
        <p className="text-xs text-text-tertiary py-6 text-center">
          {showResolved ? 'Nothing reported at all.' : 'No unresolved errors. '}
          {!showResolved && <span className="text-text-secondary">That is the good outcome.</span>}
        </p>
      ) : (
        <div className="space-y-2">
          {errors.map((e) => {
            const open = expanded === e.fingerprint;
            const ua = browser(e.lastUserAgent);
            return (
              <div
                key={e.fingerprint}
                className={`border rounded-xl overflow-hidden transition-colors ${
                  e.resolved ? 'border-white/8 bg-white/[0.01]' : 'border-white/10 bg-surface-elevated'
                }`}
              >
                <button
                  onClick={() => setExpanded(open ? null : e.fingerprint)}
                  className="w-full text-left p-3.5 flex items-start gap-3 hover:bg-white/[0.03] transition-colors"
                  aria-expanded={open}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className={`text-sm font-semibold break-words ${e.resolved ? 'text-text-tertiary line-through' : 'text-white'}`}>
                      {e.message || '(no message)'}
                    </p>
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-text-tertiary">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {ago(e.lastSeenAt)}</span>
                      {e.lastUrl && <span className="flex items-center gap-1 min-w-0"><Globe className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{e.lastUrl}</span></span>}
                      {ua && <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> {ua}</span>}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold font-mono text-accent flex-shrink-0 tabular-nums pt-0.5">{e.count}×</span>
                  <ChevronDown className={`w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="px-3.5 pb-3.5 space-y-3 border-t border-white/8 pt-3">
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <p className="text-text-tertiary uppercase tracking-wide font-semibold">First seen</p>
                        <p className="text-text-secondary mt-0.5">{ago(e.firstSeenAt)}</p>
                      </div>
                      <div>
                        <p className="text-text-tertiary uppercase tracking-wide font-semibold">Last seen</p>
                        <p className="text-text-secondary mt-0.5">{ago(e.lastSeenAt)}</p>
                      </div>
                    </div>

                    {e.stack ? (
                      // Horizontal scroll on its own container: a stack trace
                      // is the one thing here that must not be wrapped or
                      // truncated, and it must not push the page sideways.
                      <div className="overflow-x-auto rounded-lg border border-white/8 bg-black/40">
                        <pre className="text-[11px] leading-relaxed text-text-secondary p-3 font-mono whitespace-pre">{e.stack}</pre>
                      </div>
                    ) : (
                      <p className="text-xs text-text-tertiary">No stack trace was captured for this one.</p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {e.resolved ? (
                        <Button size="sm" variant="ghost" onClick={() => setResolved(e, false)} disabled={busy === e.fingerprint}>
                          <RotateCcw className="w-3.5 h-3.5" /> Reopen
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => setResolved(e, true)} disabled={busy === e.fingerprint}>
                          <Check className="w-3.5 h-3.5" /> Mark resolved
                        </Button>
                      )}
                      <span className="text-[10px] text-text-tertiary font-mono ml-auto">{e.fingerprint.slice(0, 12)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
