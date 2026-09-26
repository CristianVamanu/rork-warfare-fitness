'use client';

import { useCallback, useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

type Tally = Record<string, number>;
interface FunnelData { days: number; totals: Tally; campaigns: Record<string, Tally>; daily: { day: string; visit: number; q1: number; account: number; paid: number }[] }

/**
 * The stages shown, in order. The quiz is collapsed to four checkpoints
 * (start, halfway, body stats, email) so the chart reads at a glance; the
 * full per-question drop-off is in the table below it for the day you
 * want to know which question loses people.
 */
const STAGES: { id: string; label: string; hint: string }[] = [
  { id: 'visit', label: 'Landing page', hint: 'Opened the home page' },
  { id: 'q1', label: 'Started the quiz', hint: 'Saw question 1' },
  { id: 'q7', label: 'Halfway', hint: 'Reached question 7' },
  { id: 'q11', label: 'Body stats', hint: 'Reached the height and weight step' },
  { id: 'q13', label: 'Email step', hint: 'Reached the email step' },
  { id: 'reveal', label: 'Saw the offer', hint: 'Left an email, saw their program and the price' },
  { id: 'start', label: 'Tapped Start', hint: 'Pressed the Start button on the reveal' },
  { id: 'account', label: 'Account created', hint: 'Set a password' },
  { id: 'paid', label: 'Paid', hint: 'Payment confirmed' },
];
const QUIZ = Array.from({ length: 13 }, (_, i) => `q${i + 1}`);

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 1000) / 10}%` : '—');

export function FunnelPanel() {
  const { user } = useAuth();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch(`/api/admin/funnel?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setData(json);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [user, days]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <Skeleton className="h-64 rounded-2xl" />;
  const t = data.totals;
  const top = Math.max(1, ...STAGES.map((s) => t[s.id] ?? 0));
  const campaigns = Object.entries(data.campaigns).sort((a, b) => (b[1].visit ?? 0) + (b[1].q1 ?? 0) - ((a[1].visit ?? 0) + (a[1].q1 ?? 0)));
  const empty = STAGES.every((s) => !(t[s.id] > 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">Signup funnel</h2>
          <p className="text-xs text-text-secondary">Counted once per visit, no cookies needed. Includes people who reject cookies, so it is the true picture.</p>
        </div>
        <div className="flex items-center gap-1.5">
          {([7, 30, 90] as const).map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${days === d ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>{d}d</button>
          ))}
          <Button size="sm" variant="secondary" onClick={load} loading={loading}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {empty ? (
        <Card className="p-8 text-center">
          <p className="text-white font-bold">Nothing counted yet</p>
          <p className="text-text-secondary text-sm mt-1">Counting starts with the next deploy. Open the home page once and this will show 1 under Landing page.</p>
        </Card>
      ) : (
        <>
          <Card className="p-4 lg:p-5">
            <div className="space-y-2.5">
              {STAGES.map((s, i) => {
                const n = t[s.id] ?? 0;
                const prev = i > 0 ? (t[STAGES[i - 1].id] ?? 0) : n;
                const drop = i > 0 && prev > 0 ? prev - n : 0;
                return (
                  <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center" title={s.hint}>
                    <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm text-white truncate">{s.label}</p>
                        <p className="text-xs text-text-tertiary tabular-nums whitespace-nowrap">{i > 0 ? `${pct(n, prev)} of previous` : ''}{drop > 0 ? ` · lost ${drop}` : ''}</p>
                      </div>
                      <div className="h-2.5 rounded-full bg-white/8 mt-1 overflow-hidden">
                        <div className={`h-full rounded-full ${s.id === 'paid' ? 'bg-emerald-400' : 'bg-accent'}`} style={{ width: `${Math.max(n > 0 ? 1.5 : 0, (n / top) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="text-right w-20">
                      <p className="text-lg font-black text-white tabular-nums leading-none">{n.toLocaleString('en-US')}</p>
                      <p className="text-[10px] text-text-tertiary tabular-nums">{pct(n, t.visit ?? 0)} of visits</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/8">
              <div><p className="text-[10px] uppercase tracking-wider text-text-tertiary">Visit → paid</p><p className="text-xl font-black text-white tabular-nums">{pct(t.paid ?? 0, t.visit ?? 0)}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-text-tertiary">Quiz → offer</p><p className="text-xl font-black text-white tabular-nums">{pct(t.reveal ?? 0, t.q1 ?? 0)}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-text-tertiary">Offer → paid</p><p className="text-xl font-black text-white tabular-nums">{pct(t.paid ?? 0, t.reveal ?? 0)}</p></div>
            </div>
          </Card>

          <Card className="p-4 lg:p-5">
            <p className="text-sm font-bold text-white">Where the quiz loses people</p>
            <p className="text-xs text-text-secondary mb-3">How many reached each question. A big step down points at the question to shorten or move.</p>
            <div className="flex items-end gap-1 h-24">
              {QUIZ.map((q, i) => {
                const n = t[q] ?? 0; const first = t.q1 ?? 0;
                return (
                  <div key={q} className="flex-1 flex flex-col items-center justify-end gap-1" title={`Question ${i + 1}: ${n}`}>
                    <div className="w-full rounded-t bg-accent/80" style={{ height: `${first > 0 ? Math.max(n > 0 ? 3 : 0, (n / first) * 100) : 0}%` }} />
                    <span className="text-[10px] text-text-tertiary tabular-nums">{i + 1}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {campaigns.length > 0 && (
            <Card className="p-4 lg:p-5">
              <p className="text-sm font-bold text-white mb-3">By campaign</p>
              <p className="text-xs text-text-secondary mb-3">From the utm_campaign tag on the link. Ads without a tag count as direct.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-[10px] uppercase tracking-wider text-text-tertiary text-left"><th className="py-1.5 pr-3 font-medium">Campaign</th><th className="py-1.5 pr-3 font-medium text-right">Visits</th><th className="py-1.5 pr-3 font-medium text-right">Quiz</th><th className="py-1.5 pr-3 font-medium text-right">Offer</th><th className="py-1.5 pr-3 font-medium text-right">Accounts</th><th className="py-1.5 font-medium text-right">Paid</th></tr></thead>
                  <tbody>
                    {campaigns.map(([c, v]) => (
                      <tr key={c} className="border-t border-white/8 tabular-nums">
                        <td className="py-1.5 pr-3 text-white">{c}</td>
                        <td className="py-1.5 pr-3 text-right">{v.visit ?? 0}</td>
                        <td className="py-1.5 pr-3 text-right">{v.q1 ?? 0}</td>
                        <td className="py-1.5 pr-3 text-right">{v.reveal ?? 0}</td>
                        <td className="py-1.5 pr-3 text-right">{v.account ?? 0}</td>
                        <td className={`py-1.5 text-right font-bold ${(v.paid ?? 0) > 0 ? 'text-emerald-300' : ''}`}>{v.paid ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
