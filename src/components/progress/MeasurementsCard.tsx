'use client';

/**
 * Body measurements on the Progress page: waist, chest, hips, arm and thigh,
 * logged in cm or inches (the member's unit), with the change since their
 * first entry in the last 6 months. Stored as MEASUREMENTS_RECORDED events
 * in centimetres.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Ruler } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { getRecentEvents } from '@/lib/firestore';
import { recordMeasurements } from '@/lib/actions';

const PARTS = [
  { k: 'waist', label: 'Waist' }, { k: 'chest', label: 'Chest' }, { k: 'hips', label: 'Hips' },
  { k: 'arm', label: 'Arm' }, { k: 'thigh', label: 'Thigh' },
] as const;
type Part = typeof PARTS[number]['k'];
type Entry = { at: number; cm: Partial<Record<Part, number>> };

export function MeasurementsCard() {
  const { user, profile } = useAuth();
  const inches = profile?.weightUnit === 'lbs';
  const unit = inches ? 'in' : 'cm';
  const toU = (cm: number) => Math.round((inches ? cm / 2.54 : cm) * 10) / 10;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Record<Part, string>>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const rows = await getRecentEvents(user.uid, 'MEASUREMENTS_RECORDED', 183, 60).catch(() => []);
    setEntries(rows.map((r) => ({ at: r.at, cm: r.payload as Entry['cm'] })).sort((a, b) => a.at - b.at));
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const latest = (k: Part) => [...entries].reverse().find((e) => typeof e.cm[k] === 'number')?.cm[k];
  const first = (k: Part) => entries.find((e) => typeof e.cm[k] === 'number')?.cm[k];

  const save = async () => {
    if (!user) return;
    const cm: Partial<Record<Part, number>> = {};
    for (const p of PARTS) {
      const v = parseFloat((form[p.k] ?? '').replace(',', '.'));
      if (Number.isFinite(v) && v > 0) cm[p.k] = inches ? v * 2.54 : v;
    }
    setSaving(true);
    try {
      await recordMeasurements(user.uid, cm);
      toast.success('Measurements saved');
      setOpen(false); setForm({});
      await load();
    } catch (e) { toast.error((e as Error).message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const any = PARTS.some((p) => latest(p.k) != null);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5"><Ruler className="w-3.5 h-3.5 text-accent" /><span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Body measurements</span></div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Log</Button>
      </div>
      {any ? (
        <div className="grid grid-cols-5 gap-1.5">
          {PARTS.map((p) => {
            const l = latest(p.k), f = first(p.k);
            const d = l != null && f != null && entries.length > 1 ? toU(l) - toU(f) : null;
            return (
              <div key={p.k} className="rounded-xl bg-surface-elevated px-1.5 py-2 text-center min-w-0">
                <p className="text-sm font-black text-white tabular-nums truncate">{l != null ? toU(l) : '—'}</p>
                <p className="text-[10px] text-text-tertiary truncate">{p.label}</p>
                {d != null && d !== 0 && <p className={`text-[10px] font-semibold tabular-nums ${p.k === 'waist' || p.k === 'hips' ? (d < 0 ? 'text-success' : 'text-text-secondary') : 'text-text-secondary'}`}>{d > 0 ? '+' : ''}{Math.round(d * 10) / 10}</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-secondary">The scale does not show everything. Log your waist and a few others every 2-4 weeks to see real change.</p>
      )}
      {any && <p className="text-[11px] text-text-tertiary">In {unit}. Change is since your first entry in the last 6 months.</p>}

      <Modal open={open} onClose={() => !saving && setOpen(false)} title="Log measurements">
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">Measure in the morning, relaxed, tape level. Fill in any you like.</p>
          {PARTS.map((p) => (
            <label key={p.k} className="flex items-center justify-between gap-3">
              <span className="text-sm text-white">{p.label}</span>
              <span className="flex items-center gap-2">
                <input id={`m-${p.k}`} inputMode="decimal" value={form[p.k] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [p.k]: e.target.value }))}
                  placeholder={latest(p.k) != null ? String(toU(latest(p.k)!)) : ''}
                  className="w-24 rounded-xl px-3 py-2 text-sm bg-surface-elevated text-white border border-white/10 focus:outline-none focus:border-accent/60 text-right" />
                <span className="text-xs text-text-tertiary w-6">{unit}</span>
              </span>
            </label>
          ))}
          <Button className="w-full" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </Modal>
    </Card>
  );
}
