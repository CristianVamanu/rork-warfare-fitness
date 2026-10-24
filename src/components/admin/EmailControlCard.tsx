'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Pause, Play, Clock, ShieldAlert, ListOrdered } from 'lucide-react';
import { db } from '@/lib/firebase';
import { Card } from '@/components/ui/Card';
import { getSystemConfig, setSystemConfig } from '@/lib/firestore';
import {
  EMAIL_KINDS, EMAIL_GROUP_LABELS, emailKindAllowed, sendHourOf, emailKindDef,
  type EmailControls, type EmailKind, type EmailGroup,
} from '@/lib/emailControls';

/**
 * The admin's one place to see and stop every email the app sends.
 *
 * Switches are saved the moment they are tapped, into
 * system/config.emailControls; sendEmail reads them before every send, so
 * a kind switched off here stops within a minute on every worker. Counts
 * come from system/emailStats.kinds and the log from emailLog, both written
 * by sendEmail on success only.
 */
type LogRow = { id: string; kind: string; to: string; subject: string; provider?: string; at?: { toDate?: () => Date } };

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

export function EmailControlCard() {
  const [controls, setControls] = useState<EmailControls>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [log, setLog] = useState<LogRow[]>([]);
  const [provider, setProvider] = useState<'resend' | 'brevo'>('resend');
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, stats, rows] = await Promise.all([
          getSystemConfig().catch(() => null),
          getDoc(doc(db, 'system', 'emailStats')).catch(() => null),
          getDocs(query(collection(db, 'emailLog'), orderBy('at', 'desc'), limit(40))).catch(() => null),
        ]);
        const c = cfg as { emailControls?: EmailControls; emailProvider?: string } | null;
        setControls(c?.emailControls ?? {});
        setProvider(c?.emailProvider === 'brevo' ? 'brevo' : 'resend');
        setCounts(((stats?.exists() ? stats.data()?.kinds : null) as Record<string, number> | null) ?? {});
        setLog(rows ? rows.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LogRow, 'id'>) })) : []);
      } finally { setLoading(false); }
    })();
  }, []);

  async function save(next: EmailControls, msg: string) {
    const prev = controls;
    setControls(next);
    try {
      await setSystemConfig({ emailControls: next });
      toast.success(msg);
    } catch {
      setControls(prev);
      toast.error('Could not save');
    }
  }

  const toggleKind = (kind: EmailKind) => {
    const on = controls.kinds?.[kind] !== false;
    const def = emailKindDef(kind);
    save({ ...controls, kinds: { ...(controls.kinds ?? {}), [kind]: !on } }, `${def.label}: ${on ? 'off' : 'on'}`);
  };
  const togglePause = () => {
    const paused = controls.pauseMarketing === true;
    save({ ...controls, pauseMarketing: !paused }, paused ? 'Marketing emails resumed' : 'All marketing emails paused');
  };
  const setHour = (h: number) => save({ ...controls, sendHour: h }, `Daily emails now go out at ${hourLabel(h)}, each member's local time`);

  if (loading) return <Card className="p-5 text-sm text-text-secondary">Loading email controls…</Card>;

  const paused = controls.pauseMarketing === true;
  const groups = (['marketing', 'billing', 'account', 'admin'] as EmailGroup[]);
  const todayCount = log.filter((r) => { const d = r.at?.toDate?.(); return d && d.toDateString() === new Date().toDateString(); }).length;

  return (
    <Card className="p-4 lg:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.28em] text-accent/90 uppercase">Email control</p>
          <p className="text-base font-black text-white leading-tight">What goes out, and when</p>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            Sending through <span className="text-white font-semibold">{provider === 'brevo' ? 'Brevo' : 'Resend'}</span>.
            {todayCount > 0 ? ` ${todayCount} of the last 40 sends were today.` : ' Nothing sent yet today.'}
            {provider === 'brevo' && todayCount >= 250 && <span className="text-yellow-400"> Close to Brevo&apos;s 300 a day.</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={togglePause}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors flex-shrink-0 ${
            paused ? 'border-danger/40 bg-danger/15 text-danger' : 'border-white/10 bg-black/25 text-white hover:border-accent/40'
          }`}
        >
          {paused ? <><Play className="w-3.5 h-3.5" /> Resume marketing</> : <><Pause className="w-3.5 h-3.5" /> Pause all marketing</>}
        </button>
      </div>

      {paused && (
        <p className="text-xs text-danger flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> Every marketing email is on hold. Account and billing emails still go.</p>
      )}

      <div className="rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-xs text-white font-semibold"><Clock className="w-3.5 h-3.5 text-accent" /> Daily sends go out at</span>
        <select
          value={sendHourOf(controls)}
          onChange={(e) => setHour(Number(e.target.value))}
          className="bg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
        >
          {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
        </select>
        <span className="text-[11px] text-text-tertiary">in each member&apos;s own timezone. Covers reminders, follow-ups and the free plan.</span>
      </div>

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g}>
            <div className="flex items-center gap-3 mb-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-text-tertiary">{EMAIL_GROUP_LABELS[g]}</p>
              <span className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </div>
            <div className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
              {EMAIL_KINDS.filter((k) => k.group === g).map((k) => {
                const on = controls.kinds?.[k.kind] !== false;
                const effective = emailKindAllowed(controls, k.kind);
                const n = counts[k.kind] ?? 0;
                return (
                  <div key={k.kind} className={`flex items-center gap-3 px-3 py-2.5 bg-surface ${!effective ? 'opacity-60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{k.label}</p>
                      <p className="text-[11px] text-text-tertiary truncate">{k.when}</p>
                      {!on && k.warning && <p className="text-[11px] text-yellow-400 mt-0.5">{k.warning}</p>}
                    </div>
                    <span className="text-[11px] tabular-nums text-text-tertiary flex-shrink-0">{n ? `${n} sent` : ''}</span>
                    {k.required ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary px-2 py-1 rounded-md border border-white/10 flex-shrink-0">Always</span>
                    ) : (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        onClick={() => toggleKind(k.kind)}
                        className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${on ? 'bg-accent' : 'bg-surface-elevated'}`}
                      >
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div>
        <button type="button" onClick={() => setShowLog((v) => !v)} className="text-xs font-semibold text-text-secondary hover:text-white inline-flex items-center gap-1.5">
          <ListOrdered className="w-3.5 h-3.5" /> {showLog ? 'Hide' : 'Show'} the last {log.length} sends
        </button>
        {showLog && (
          <div className="mt-2 rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5 max-h-80 overflow-y-auto">
            {log.length === 0 && <p className="px-3 py-3 text-xs text-text-tertiary">Nothing logged yet. Sends are recorded from now on.</p>}
            {log.map((r) => {
              const d = r.at?.toDate?.();
              return (
                <div key={r.id} className="px-3 py-2 bg-surface flex items-center gap-3 text-xs">
                  <span className="text-text-tertiary tabular-nums w-24 flex-shrink-0">{d ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  <span className="text-accent w-24 truncate flex-shrink-0">{emailKindDef(r.kind as EmailKind).label.split(' ')[0]}</span>
                  <span className="text-white truncate flex-1">{r.subject}</span>
                  <span className="text-text-tertiary truncate w-40 text-right">{r.to}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
