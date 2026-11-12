'use client';

/**
 * Overview card: is anything paid running low? OpenAI spend and the credit
 * left (from the balance recorded at the last top-up), Brevo email credits,
 * and today's AI calls against the daily ceiling. Data: /api/admin/ai-balance.
 */
import { useCallback, useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Wallet, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface Balance {
  openai: { configured: boolean; error?: string; todayUsd?: number; last7Usd?: number; monthUsd?: number; dailyAvgUsd?: number; sinceTopUpUsd?: number; remainingUsd?: number };
  budget: { creditUsd: number | null; lowAtUsd: number; asOf: number | null };
  brevo: { credits: number; type: string }[] | null;
  usage: { used: number; limit: number; byFeature: Record<string, number> } | null;
}

const usd = (n: number | undefined) => (n == null ? '—' : `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`);

export function AiBalancePanel({ onSetup }: { onSetup: () => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [credit, setCredit] = useState('');
  const [lowAt, setLowAt] = useState('10');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-balance', { headers: { Authorization: `Bearer ${await getIdToken(user)}` } });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setData(j);
      setLowAt(String(j.budget?.lowAtUsd ?? 10));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load balances');
    } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!user) return;
    const res = await fetch('/api/admin/ai-balance', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getIdToken(user)}` },
      body: JSON.stringify({ creditUsd: Number(credit), lowAtUsd: Number(lowAt) }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(j.error || 'Could not save'); return; }
    toast.success('Balance saved');
    setEditing(false); setCredit(''); load();
  }

  const o = data?.openai;
  const remaining = o?.remainingUsd;
  const low = remaining != null && data && remaining <= data.budget.lowAtUsd;
  const daysLeft = remaining != null && o?.dailyAvgUsd ? Math.floor(remaining / o.dailyAvgUsd) : null;
  const usagePct = data?.usage ? Math.min(100, Math.round((data.usage.used / Math.max(1, data.usage.limit)) * 100)) : 0;

  return (
    <Card className={`p-4 lg:p-5 space-y-4 ${low ? 'border-red-500/60' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-accent" />
          <p className="text-sm font-bold text-white">AI &amp; service balances</p>
        </div>
        <button onClick={load} disabled={loading} aria-label="Refresh" className="text-text-tertiary hover:text-white disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {low && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>OpenAI credit is low: about {usd(remaining)} left. Top up before the AI features stop.</span>
        </div>
      )}

      {/* OpenAI */}
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">OpenAI</p>
          <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noopener noreferrer" className="text-xs text-accent inline-flex items-center gap-1">Top up <ExternalLink className="w-3 h-3" /></a>
        </div>
        {!o?.configured ? (
          <p className="text-xs text-text-tertiary">
            Add an OpenAI <b>Admin key</b> (sk-admin-…, from platform.openai.com → Settings → Admin keys) in{' '}
            <button onClick={onSetup} className="text-accent underline">Integrations → OpenAI</button> to see spend here.
          </p>
        ) : o.error ? (
          <p className="text-xs text-red-300">{o.error}</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-lg font-black text-white tabular-nums">{usd(o.todayUsd)}</p><p className="text-[10px] text-text-tertiary uppercase">Today</p></div>
              <div><p className="text-lg font-black text-white tabular-nums">{usd(o.last7Usd)}</p><p className="text-[10px] text-text-tertiary uppercase">7 days</p></div>
              <div><p className="text-lg font-black text-white tabular-nums">{usd(o.monthUsd)}</p><p className="text-[10px] text-text-tertiary uppercase">This month</p></div>
            </div>
            {remaining != null ? (
              <p className={`text-sm ${low ? 'text-red-300' : 'text-white'}`}>
                Credit left: <b className="tabular-nums">{usd(remaining)}</b>
                {daysLeft != null && <span className="text-text-tertiary"> · about {daysLeft} day{daysLeft === 1 ? '' : 's'} at the current rate</span>}
              </p>
            ) : (
              <p className="text-xs text-text-tertiary">Record your OpenAI credit balance below to see what is left. OpenAI has no API for the balance itself.</p>
            )}
            {data?.budget.asOf && <p className="text-[11px] text-text-tertiary">Balance recorded {new Date(data.budget.asOf).toLocaleDateString()} as {usd(data.budget.creditUsd ?? undefined)} · spent since {usd(o.sinceTopUpUsd)}</p>}
          </>
        )}
        {editing ? (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <label className="text-xs text-text-secondary">Current balance ($)
              <input inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="e.g. 25" className="mt-1 block w-28 rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-white" />
            </label>
            <label className="text-xs text-text-secondary">Warn me below ($)
              <input inputMode="decimal" value={lowAt} onChange={(e) => setLowAt(e.target.value)} className="mt-1 block w-24 rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-white" />
            </label>
            <Button size="sm" onClick={save} disabled={!credit}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs text-accent underline">I just topped up / set balance</button>
        )}
      </div>

      {/* Brevo */}
      {data?.brevo && data.brevo.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-text-secondary mb-1">Brevo email</p>
          {data.brevo.map((b) => <p key={b.type} className="text-sm text-white"><b className="tabular-nums">{b.credits.toLocaleString()}</b> <span className="text-text-tertiary">{b.type} left</span></p>)}
        </div>
      )}

      {/* Today's AI calls */}
      {data?.usage && (
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <p className="font-bold uppercase tracking-wide text-text-secondary">AI calls today</p>
            <p className="text-text-secondary tabular-nums">{data.usage.used.toLocaleString()} / {data.usage.limit.toLocaleString()}</p>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className={`h-full ${usagePct >= 80 ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${usagePct}%` }} /></div>
          {Object.keys(data.usage.byFeature).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.usage.byFeature).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-text-secondary">{f} · {n}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
