'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Mail, ChevronDown, RotateCcw, Send, Check } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  SEQUENCES, resolveSequences,
  type SequenceKey, type SequenceOverrides, type StepOverride,
} from '@/lib/emailSequences';

/**
 * Every automated email, editable in place.
 *
 * The sequences shipped with fixed copy and a single on/off each. This is
 * the rest: per step, the day it sends, the subject, heading, body and
 * button; a switch per step and per sequence; a reset that returns a step
 * to the built-in text; a "send me a test" that delivers the real
 * rendered email to the signed-in admin; and the count of how many times
 * each step has actually gone out.
 *
 * Edits are stored as OVERRIDES in system/emailOverrides, never as a copy
 * of the whole email. So a blank field means "use the default", a reset is
 * deleting one key, and a future change to the built-in copy reaches every
 * step the admin has not touched. lib/emailSequences resolves the two.
 */

const OVERRIDES_REF = () => doc(db, 'system', 'emailOverrides');
const STATS_REF = () => doc(db, 'system', 'emailStats');

type Draft = Record<SequenceKey, Record<string, StepOverride>>;

const emptyDraft = (): Draft => ({ leadTips: {}, onboardingAbandon: {}, winBack: {} });

export function EmailsPanel() {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState<SequenceOverrides>({});
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, s] = await Promise.all([getDoc(OVERRIDES_REF()), getDoc(STATS_REF())]);
        const ov = (o.exists() ? o.data() : {}) as SequenceOverrides;
        setOverrides(ov);
        const d = emptyDraft();
        for (const k of Object.keys(SEQUENCES) as SequenceKey[]) d[k] = { ...(ov[k]?.steps ?? {}) };
        setDraft(d);
        const flat: Record<string, number> = {};
        const c = (s.exists() ? s.data()?.counts : null) as Record<string, Record<string, number>> | null;
        if (c) for (const [seq, steps] of Object.entries(c)) for (const [step, n] of Object.entries(steps)) flat[`${seq}.${step}`] = n;
        setCounts(flat);
      } catch { toast.error('Could not load email settings'); }
      finally { setLoading(false); }
    })();
  }, []);

  const resolved = resolveSequences(overrides);

  function setStep(seq: SequenceKey, step: string, patch: StepOverride) {
    setDraft((d) => ({ ...d, [seq]: { ...d[seq], [step]: { ...(d[seq][step] ?? {}), ...patch } } }));
  }

  async function saveStep(seq: SequenceKey, step: string) {
    setSaving(`${seq}.${step}`);
    try {
      const o = draft[seq][step] ?? {};
      // Only the keys the admin actually set travel; blanks are removed so
      // the built-in copy takes over rather than an empty string.
      const clean: StepOverride = {};
      if (typeof o.enabled === 'boolean') clean.enabled = o.enabled;
      if (Number.isInteger(o.day) && (o.day as number) >= 0) clean.day = o.day;
      for (const k of ['subject', 'heading', 'ctaLabel', 'ctaPath'] as const) {
        const v = o[k];
        if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
      }
      if (Array.isArray(o.paragraphs)) {
        const ps = o.paragraphs.map((p) => (p ?? '').trim()).filter(Boolean);
        if (ps.length) clean.paragraphs = ps;
      }
      await setDoc(OVERRIDES_REF(), { [seq]: { steps: { [step]: Object.keys(clean).length ? clean : deleteField() } } }, { merge: true });
      setOverrides((prev) => ({ ...prev, [seq]: { ...(prev[seq] ?? {}), steps: { ...(prev[seq]?.steps ?? {}), [step]: clean } } }));
      toast.success('Saved');
    } catch { toast.error('Save failed'); }
    finally { setSaving(null); }
  }

  async function resetStep(seq: SequenceKey, step: string) {
    setSaving(`${seq}.${step}`);
    try {
      await setDoc(OVERRIDES_REF(), { [seq]: { steps: { [step]: deleteField() } } }, { merge: true });
      setOverrides((prev) => {
        const steps = { ...(prev[seq]?.steps ?? {}) };
        delete steps[step];
        return { ...prev, [seq]: { ...(prev[seq] ?? {}), steps } };
      });
      setDraft((d) => { const n = { ...d, [seq]: { ...d[seq] } }; delete n[seq][step]; return n; });
      toast.success('Back to the default');
    } catch { toast.error('Reset failed'); }
    finally { setSaving(null); }
  }

  async function toggleSequence(seq: SequenceKey, enabled: boolean) {
    try {
      await setDoc(OVERRIDES_REF(), { [seq]: { enabled } }, { merge: true });
      setOverrides((prev) => ({ ...prev, [seq]: { ...(prev[seq] ?? {}), enabled } }));
    } catch { toast.error('Could not update'); }
  }

  async function sendTest(seq: SequenceKey, step: string) {
    if (!user) return;
    setTesting(`${seq}.${step}`);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/email-test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ seq, step }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Send failed');
      toast.success(`Sent to ${data.to}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Send failed'); }
    finally { setTesting(null); }
  }

  if (loading) return <Card className="p-5 text-sm text-text-secondary">Loading…</Card>;

  return (
    <div className="space-y-4">
      <Card className="p-4 lg:p-5">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-gradient-accent text-black flex items-center justify-center"><Mail className="w-3.5 h-3.5" /></span>
          Automated emails
        </h2>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
          Every email carries a one-click unsubscribe and never goes to anyone who has used one. Edit a step and save it;
          leave a field blank to keep the built-in text. Counts are total sends of that step.
        </p>
      </Card>

      {(Object.keys(SEQUENCES) as SequenceKey[]).map((seq) => {
        const def = SEQUENCES[seq];
        const r = resolved[seq];
        return (
          <Card key={seq} className="p-4 lg:p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{def.label}</p>
                <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{def.description}</p>
              </div>
              <button
                onClick={() => toggleSequence(seq, !r.enabled)}
                aria-pressed={r.enabled}
                className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${r.enabled ? 'bg-accent' : 'bg-surface-elevated'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${r.enabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            <div className="space-y-2">
              {def.steps.map((st) => {
                const id = `${seq}.${st.key}`;
                const o = draft[seq][st.key] ?? {};
                const eff = r.steps.find((x) => x.key === st.key);
                const disabled = o.enabled === false;
                const edited = Object.keys(overrides[seq]?.steps?.[st.key] ?? {}).length > 0;
                const isOpen = open === id;
                return (
                  <div key={st.key} className="rounded-xl border border-white/10 bg-black/20">
                    <button type="button" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                      <span className={`wf-readout text-[10px] font-bold w-14 flex-shrink-0 ${disabled ? 'text-text-tertiary line-through' : 'text-accent'}`}>Day {eff?.day ?? o.day ?? st.day}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-white truncate">{eff?.subject ?? o.subject ?? st.subject}</span>
                        <span className="block text-[11px] text-text-tertiary">
                          {disabled ? 'Off' : `Sent ${counts[id] ?? 0}×`}{edited ? ' · edited' : ''}
                        </span>
                      </span>
                      <ChevronDown className={`w-4 h-4 text-text-tertiary flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/10">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[11px] text-text-tertiary">
                            Send on day
                            <input type="number" min={0} value={o.day ?? st.day} onChange={(e) => setStep(seq, st.key, { day: Number(e.target.value) })}
                              className="mt-1 w-full bg-surface border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-accent/50" />
                          </label>
                          <label className="text-[11px] text-text-tertiary flex flex-col justify-end">
                            <span className="flex items-center justify-between rounded-lg border border-white/10 bg-surface px-2.5 py-2">
                              <span className="text-sm text-white">This step</span>
                              <button type="button" onClick={() => setStep(seq, st.key, { enabled: disabled })} aria-pressed={!disabled}
                                className={`w-9 h-5 rounded-full relative ${!disabled ? 'bg-accent' : 'bg-surface-elevated'}`}>
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${!disabled ? 'left-4' : 'left-0.5'}`} />
                              </button>
                            </span>
                          </label>
                        </div>
                        <Field label="Subject" value={o.subject ?? ''} placeholder={st.subject} onChange={(v) => setStep(seq, st.key, { subject: v })} />
                        <Field label="Heading" value={o.heading ?? ''} placeholder={st.heading} onChange={(v) => setStep(seq, st.key, { heading: v })} />
                        <label className="block text-[11px] text-text-tertiary">
                          Body (one paragraph per line)
                          <textarea rows={4} value={(o.paragraphs ?? []).join('\n')} placeholder={st.paragraphs.join('\n')}
                            onChange={(e) => setStep(seq, st.key, { paragraphs: e.target.value.split('\n') })}
                            className="mt-1 w-full bg-surface border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-text-tertiary/60 focus:outline-none focus:border-accent/50" />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Button text" value={o.ctaLabel ?? ''} placeholder={st.cta.label} onChange={(v) => setStep(seq, st.key, { ctaLabel: v })} />
                          <Field label="Button link (on this site)" value={o.ctaPath ?? ''} placeholder={st.cta.path} onChange={(v) => setStep(seq, st.key, { ctaPath: v })} />
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          {edited && (
                            <button type="button" onClick={() => resetStep(seq, st.key)} className="text-xs text-text-tertiary hover:text-white px-2 py-2 inline-flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" /> Reset to default
                            </button>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => sendTest(seq, st.key)} loading={testing === id}>
                            <Send className="w-3.5 h-3.5" /> Send me a test
                          </Button>
                          <Button size="sm" onClick={() => saveStep(seq, st.key)} loading={saving === id}>
                            <Check className="w-3.5 h-3.5" /> Save
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-[11px] text-text-tertiary">
      {label}
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-surface border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-text-tertiary/60 focus:outline-none focus:border-accent/50" />
    </label>
  );
}
