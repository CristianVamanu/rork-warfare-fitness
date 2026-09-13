'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Ticket, Plus, Power, Loader2, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Discount codes for service members, emergency workers and anyone else worth
 * looking after.
 *
 * Stripe holds these, not Firestore, so this panel is a view onto the same
 * objects the Stripe dashboard shows. Nothing here changes how checkout works:
 * the code box is already on the payment page, and this only fills it with
 * codes that work.
 */

interface PromoCode {
  id: string;
  code: string;
  active: boolean;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  percentOff: number | null;
  duration: 'forever' | 'once' | 'repeating' | null;
  durationInMonths: number | null;
}

const DURATIONS = [
  { id: 'forever', label: 'Every payment', hint: 'The discount lasts as long as they stay subscribed.' },
  { id: 'once', label: 'First payment only', hint: 'Careful: with the paid trial on, the first payment is the trial fee.' },
  { id: 'repeating', label: 'A set number of months', hint: 'Full price resumes after that.' },
] as const;

function describe(c: PromoCode): string {
  const off = c.percentOff ? `${c.percentOff}% off` : 'Discount';
  if (c.duration === 'forever') return `${off}, every payment`;
  if (c.duration === 'once') return `${off}, first payment only`;
  if (c.duration === 'repeating') return `${off} for ${c.durationInMonths} month${c.durationInMonths === 1 ? '' : 's'}`;
  return off;
}

export function PromoCodesPanel() {
  const { user } = useAuth();
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [code, setCode] = useState('');
  const [percentOff, setPercentOff] = useState('25');
  const [duration, setDuration] = useState<'forever' | 'once' | 'repeating'>('forever');
  const [months, setMonths] = useState('3');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const call = useCallback(async (method: 'GET' | 'POST' | 'PATCH', body?: unknown) => {
    if (!user) throw new Error('Not signed in');
    const token = await getIdToken(user);
    const res = await fetch('/api/admin/promo-codes', {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, [user]);

  const load = useCallback(() => {
    call('GET')
      .then((d) => setCodes(d.codes ?? []))
      .catch((e) => { setCodes([]); toast.error(e.message); });
  }, [call]);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function handleCreate() {
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,24}$/.test(clean)) {
      toast.error('Code must be 3 to 24 letters and numbers, no spaces.');
      return;
    }
    const pct = Number(percentOff);
    // A slip of the keyboard here gives the whole product away, and Stripe
    // will accept it without comment.
    if (pct >= 60 && !confirm(`${clean} takes ${pct}% off every eligible payment. Create it?`)) return;

    setCreating(true);
    try {
      await call('POST', {
        code: clean,
        percentOff: pct,
        duration,
        ...(duration === 'repeating' ? { durationInMonths: Number(months) } : {}),
        ...(maxRedemptions ? { maxRedemptions: Number(maxRedemptions) } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      });
      toast.success(`${clean} is live`);
      setCode(''); setMaxRedemptions(''); setExpiresAt(''); setShowForm(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the code');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(c: PromoCode) {
    if (c.active && !confirm(`Turn off ${c.code}? Nobody new can use it. Anyone already on the discount keeps it.`)) return;
    setTogglingId(c.id);
    try {
      await call('PATCH', { id: c.id, active: !c.active });
      setCodes((prev) => prev?.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the code');
    } finally {
      setTogglingId(null);
    }
  }

  const field = 'w-full bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50';
  const label = 'text-[11px] font-semibold uppercase tracking-wide text-text-tertiary mb-1.5 block';

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Ticket className="w-5 h-5 text-accent" /> Discount codes
          </h3>
          <p className="text-xs text-text-secondary mt-1 max-w-prose">
            For service members, emergency workers, police and anyone else you want to look after.
            Members type the code on the payment page.
          </p>
        </div>
        <Button size="sm" variant={showForm ? 'ghost' : 'primary'} onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : <><Plus className="w-4 h-4" /> New code</>}
        </Button>
      </div>

      {showForm && (
        <div className="mt-4 p-4 rounded-xl bg-surface border border-white/8 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="promo-code">Code</label>
              <input
                id="promo-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FORCES25"
                className={`${field} font-mono tracking-wider`}
              />
            </div>
            <div>
              <label className={label} htmlFor="promo-percent">Percent off</label>
              <input
                id="promo-percent"
                type="number" min={1} max={100}
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
                className={field}
              />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="promo-duration">How long it applies</label>
            <select
              id="promo-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value as typeof duration)}
              className={field}
            >
              {DURATIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <p className="text-[11px] text-text-tertiary mt-1.5 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
              {DURATIONS.find((d) => d.id === duration)?.hint}
            </p>
          </div>

          {duration === 'repeating' && (
            <div>
              <label className={label} htmlFor="promo-months">Months</label>
              <input id="promo-months" type="number" min={1} max={36} value={months} onChange={(e) => setMonths(e.target.value)} className={field} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="promo-uses">Total uses (optional)</label>
              <input
                id="promo-uses"
                type="number" min={1}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
                className={field}
              />
              <p className="text-[11px] text-text-tertiary mt-1.5">Set this to 1 to issue a personal code to one person.</p>
            </div>
            <div>
              <label className={label} htmlFor="promo-expires">Expires (optional)</label>
              <input id="promo-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={field} />
            </div>
          </div>

          <Button fullWidth loading={creating} onClick={handleCreate}>Create code</Button>
        </div>
      )}

      <div className="mt-4">
        {codes === null ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : codes.length === 0 ? (
          <p className="text-sm text-text-tertiary py-6 text-center">
            No codes yet. A good first one is a forces discount that lasts for every payment.
          </p>
        ) : (
          <ul className="space-y-2">
            {codes.map((c) => (
              <li
                key={c.id}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  c.active ? 'bg-surface border-white/8' : 'bg-surface/50 border-white/5 opacity-60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm text-white tracking-wider">{c.code}</span>
                    {!c.active && <span className="text-[10px] font-bold uppercase text-text-tertiary">Off</span>}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {describe(c)}
                    {' · '}
                    {c.timesRedeemed} used{c.maxRedemptions ? ` of ${c.maxRedemptions}` : ''}
                    {c.expiresAt ? ` · until ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleToggle(c)}
                  disabled={togglingId === c.id}
                  aria-label={c.active ? `Turn off ${c.code}` : `Turn on ${c.code}`}
                  title={c.active ? 'Turn off' : 'Turn on'}
                  className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                    c.active ? 'text-text-tertiary hover:text-danger hover:bg-danger/10' : 'text-accent hover:bg-accent/10'
                  }`}
                >
                  {togglingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-text-tertiary mt-4 leading-relaxed">
        A code cannot be used while a site-wide sale is running, because Stripe will not apply two
        discounts to one payment. Codes are never deleted, only switched off, so anyone already on a
        discount keeps it.
      </p>
    </Card>
  );
}
