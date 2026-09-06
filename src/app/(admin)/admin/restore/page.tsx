'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { AlertTriangle, Archive, ChevronLeft, RotateCcw, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

// Collections an admin can restore in one go. Deliberately the ones where a
// bad write or an accidental delete is recoverable in isolation — restoring
// `users` wholesale is excluded here because it carries membership state that
// Stripe also holds, and the two would silently disagree.
const RESTORABLE = [
  'programs', 'exerciseLibrary', 'config', 'channels', 'posts',
  'goals', 'ptTestResults', 'coachingApplications', 'supportTickets',
  'prPosts', 'progressPhotos', 'communityActivity', 'trainerLeads', 'landingLeads',
];

interface Backup { key: string; sizeBytes: number; lastModified: string | null }
interface Plan {
  manifest: { version?: number; createdAt?: string } | null;
  counts: Record<string, number>;
  documents: number;
  skippedAuthAccounts: number;
  confirmPhrase?: string;
  written?: number;
  applied?: boolean;
  reconcileAdvised?: boolean;
}

export default function RestorePage() {
  const { user } = useAuth();
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [key, setKey] = useState('');
  const [scopeType, setScopeType] = useState<'collection' | 'user'>('collection');
  const [scopeValue, setScopeValue] = useState('programs');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);

  const call = useCallback(async (method: 'GET' | 'POST', body?: unknown) => {
    if (!user) throw new Error('Not signed in');
    const token = await getIdToken(user);
    const res = await fetch('/api/admin/restore', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    call('GET')
      .then((d) => {
        setBackups(d.backups ?? []);
        if (d.backups?.[0]) setKey(d.backups[0].key);
      })
      .catch((e) => { setBackups([]); toast.error(e.message); });
  }, [user, call]);

  // Any change to what would be restored invalidates the preview — never let
  // a confirmation typed against one plan apply to a different one.
  useEffect(() => { setPlan(null); setConfirm(''); }, [key, scopeType, scopeValue]);

  const preview = async () => {
    setBusy('preview');
    try {
      setPlan(await call('POST', { key, scopeType, scopeValue, apply: false }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const apply = async () => {
    setBusy('apply');
    try {
      const res = await call('POST', { key, scopeType, scopeValue, apply: true, confirm });
      setPlan(res);
      setConfirm('');
      toast.success(`Restored ${res.written} document${res.written === 1 ? '' : 's'}`, { duration: 8000 });
    } catch (e) { toast.error((e as Error).message, { duration: 8000 }); }
    finally { setBusy(null); }
  };

  const fmtSize = (n: number) => n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString() : '—';

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-white">
        <ChevronLeft className="w-3.5 h-3.5" /> Admin
      </Link>

      <div>
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-accent" /> Restore from backup
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Put one collection, or one member&apos;s data, back to how it was in a nightly backup.
        </p>
      </div>

      {/* The limits are stated up front rather than discovered. Someone
          arriving here during an incident should not have to guess what this
          screen will and will not do. */}
      <Card className="p-4 border-accent/25 space-y-2">
        <p className="text-sm font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-accent" /> What this does and doesn&apos;t do
        </p>
        <ul className="text-xs text-text-secondary leading-relaxed list-disc pl-4 space-y-1">
          <li><b className="text-white">Overwrites</b> documents that exist in the backup. It never deletes, so anything created since the backup stays.</li>
          <li><b className="text-white">Does not restore logins.</b> Firebase Auth accounts are skipped — restoring one silently reverts that person&apos;s password.</li>
          <li><b className="text-white">Does not roll back billing.</b> Stripe holds its own record; a member who paid or cancelled since this backup will not be undone here.</li>
          <li>A whole-database rollback is deliberately not available from this screen — see <code className="text-accent">RESTORE.md</code>.</li>
        </ul>
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Backup</label>
          {backups === null ? (
            <Skeleton className="h-11 rounded-xl" />
          ) : backups.length === 0 ? (
            <p className="text-xs text-danger">
              No backups found. Check that R2_BACKUP_BUCKET_NAME is set in Integrations and that a backup has run.
            </p>
          ) : (
            <select
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
            >
              {backups.map((b) => (
                <option key={b.key} value={b.key}>
                  {fmtDate(b.lastModified)} · {fmtSize(b.sizeBytes)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Restore</label>
          <div className="grid grid-cols-2 gap-1 bg-surface rounded-xl p-1 mb-2">
            {(['collection', 'user'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setScopeType(t); setScopeValue(t === 'collection' ? 'programs' : ''); }}
                className={`py-2 text-xs font-medium rounded-lg transition-all ${
                  scopeType === t ? 'bg-surface-elevated text-white' : 'text-text-secondary'
                }`}
              >
                {t === 'collection' ? 'A collection' : 'One member'}
              </button>
            ))}
          </div>

          {scopeType === 'collection' ? (
            <select
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
            >
              {RESTORABLE.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value.trim())}
              placeholder="User ID (uid)"
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary"
            />
          )}
        </div>

        <Button fullWidth variant="ghost" onClick={preview} loading={busy === 'preview'} disabled={!key || !scopeValue}>
          <Archive className="w-4 h-4" /> Preview — writes nothing
        </Button>
      </Card>

      {plan && (
        <Card className={`p-4 space-y-3 ${plan.applied ? 'border-green-500/30' : 'border-accent/30'}`}>
          <p className="text-sm font-bold text-white">
            {plan.applied ? `Restored ${plan.written} document${plan.written === 1 ? '' : 's'}` : `${plan.documents} document${plan.documents === 1 ? '' : 's'} would be written`}
          </p>
          {plan.manifest?.createdAt && (
            <p className="text-xs text-text-tertiary">Backup taken {fmtDate(plan.manifest.createdAt)}</p>
          )}

          {plan.documents === 0 && !plan.applied && (
            <p className="text-xs text-danger">
              Nothing in this backup matches that scope. Check the collection name or user ID.
            </p>
          )}

          {Object.keys(plan.counts).length > 0 && (
            <div className="text-xs text-text-secondary space-y-0.5">
              {Object.entries(plan.counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                <div key={c} className="flex justify-between"><span>{c}</span><span className="text-white">{n}</span></div>
              ))}
            </div>
          )}

          {plan.skippedAuthAccounts > 0 && (
            <p className="text-xs text-text-tertiary">
              {plan.skippedAuthAccounts} Auth account{plan.skippedAuthAccounts === 1 ? '' : 's'} in this backup were skipped — logins are not restored here.
            </p>
          )}

          {plan.reconcileAdvised && (
            <p className="text-xs text-yellow-400 flex gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              This touched membership data. Run subscription reconciliation so Firestore and Stripe agree again.
            </p>
          )}

          {!plan.applied && plan.documents > 0 && (
            <div className="pt-2 border-t border-white/8 space-y-2">
              <label className="text-xs text-text-secondary block">
                Type <code className="text-accent">{plan.confirmPhrase}</code> to apply
              </label>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={plan.confirmPhrase}
                className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary"
              />
              <Button
                fullWidth
                onClick={apply}
                loading={busy === 'apply'}
                disabled={confirm.trim().toLowerCase() !== plan.confirmPhrase}
              >
                Overwrite {plan.documents} document{plan.documents === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
