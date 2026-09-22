'use client';

import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, setDoc, deleteField, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Mail, ChevronDown, RotateCcw, Send, Check, Megaphone, Gift, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  SEQUENCES, resolveSequences, sequenceToggles, SEQUENCE_DEFAULTS,
  type SequenceKey, type SequenceOverrides, type StepOverride, type SequenceToggles,
} from '@/lib/emailSequences';
import { getAllPrograms, setSystemConfig, getSystemConfig } from '@/lib/firestore';
import { MOCK_PROGRAMS } from '@/lib/programs';
import { freePlanConfig, offerCopy, offerPath, dripDayFor, FREE_PLAN_DAY_OPTIONS, FREE_PLAN_DEFAULTS, type FreePlanConfig, type FreePlanOffer } from '@/lib/freePlan';
import { BROADCAST_AUDIENCES, AUDIENCE_LABELS, type BroadcastAudience } from '@/lib/broadcast';

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
  // The sequence-level switches live in system/config, and the cron reads
  // them before the overrides. Without them here a sequence switched off
  // in config showed as on in this panel while never sending.
  const [toggles, setToggles] = useState<SequenceToggles>(SEQUENCE_DEFAULTS);

  useEffect(() => {
    (async () => {
      try {
        const [o, s, cfg] = await Promise.all([getDoc(OVERRIDES_REF()), getDoc(STATS_REF()), getSystemConfig().catch(() => null)]);
        setToggles(sequenceToggles(cfg as { emailSequences?: Partial<SequenceToggles> } | null));
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

  const resolved = resolveSequences(overrides, toggles);

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

      <FreePlanCard counts={counts} />
      <BroadcastCard />

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

/**
 * The free-plan lead magnet: which program drips, for how long, and the
 * two lines on the page. Off means /free-plan is a 404, so nothing can be
 * advertised before it is set up.
 */
function FreePlanCard({ counts }: { counts: Record<string, number> }) {
  const [form, setForm] = useState<FreePlanConfig>({ ...FREE_PLAN_DEFAULTS, programId: '', programName: '', offers: [] });
  const [programs, setPrograms] = useState<{ id: string; name: string; goal?: string; recommendedForGoals?: string[]; hasWeekOne: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, progs] = await Promise.all([getSystemConfig().catch(() => null), getAllPrograms().catch(() => [])]);
        setForm(freePlanConfig(cfg as { freePlan?: Record<string, unknown> } | null));
        type P = { id: string; name?: string; isPublic?: boolean; goal?: string; recommendedForGoals?: string[]; schedule?: unknown[]; phases?: { schedule?: unknown[] }[] };
        const live = (progs as P[]).filter((p) => p.isPublic !== false && p.name);
        // The drip sends phase one's sessions. A program with none renders a
        // page but fails at signup, so it is flagged here, before it is ticked.
        setPrograms((live.length ? live : (MOCK_PROGRAMS as unknown as P[])).map((p) => ({
          id: p.id, name: p.name as string, goal: p.goal, recommendedForGoals: p.recommendedForGoals,
          hasWeekOne: dripDayFor(p as Parameters<typeof dripDayFor>[0], 1) !== null,
        })));
      } finally { setLoaded(true); }
    })();
  }, []);

  const onOffer = (id: string) => form.offers.some((o) => o.id === id);

  function toggleOffer(p: { id: string; name: string }) {
    setForm((f) => {
      const offers = onOffer(p.id) ? f.offers.filter((o) => o.id !== p.id) : [...f.offers, { id: p.id, name: p.name, headline: '', subheadline: '' }];
      const programId = offers.some((o) => o.id === f.programId) ? f.programId : (offers[0]?.id ?? '');
      return { ...f, offers, programId };
    });
  }

  function editOffer(id: string, patch: Partial<FreePlanOffer>) {
    setForm((f) => ({ ...f, offers: f.offers.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  }

  async function save() {
    setSaving(true);
    try {
      // Names are re-read from the program list so a renamed program shows
      // its current name in the picker and in emails.
      const offers = form.offers.map((o) => ({ ...o, name: programs.find((p) => p.id === o.id)?.name ?? o.name }));
      const def = offers.find((o) => o.id === form.programId);
      await setSystemConfig({ freePlan: { enabled: form.enabled, days: form.days, programId: def?.id ?? '', programName: def?.name ?? '', offers } });
      toast.success(form.enabled && offers.length ? `Free plan is live: ${offers.length} program${offers.length === 1 ? '' : 's'} on offer` : 'Saved — free plan is off');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  }

  function copyLink(path: string) {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard?.writeText(url).then(() => toast.success('Link copied')).catch(() => toast(url));
  }

  const dripTotal = Object.entries(counts).filter(([k]) => k.startsWith('drip.')).reduce((a, [, n]) => a + n, 0);
  const canSave = !form.enabled || form.offers.length > 0;

  return (
    <Card className="p-4 lg:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white flex items-center gap-2"><Gift className="w-4 h-4 text-accent" /> Free plan funnel</p>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
            Every program you tick gets its own page at <span className="text-white">/free-plan/&lt;program-name&gt;</span> for ads. <span className="text-white">/free-plan/pick</span> shows them all, for organic posts. A visitor leaves an email and gets one real session a day, then a pitch for the rest. {dripTotal ? `${dripTotal} session emails sent so far.` : ''}
          </p>
        </div>
        <button
          onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
          aria-pressed={form.enabled}
          className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.enabled ? 'bg-accent' : 'bg-surface-elevated'}`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.enabled ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
      {loaded && (
        <div className="space-y-3">
          <label className="block text-[11px] text-text-tertiary">
            How many days (same for every program)
            <div className="mt-1 flex gap-2 max-w-xs">
              {FREE_PLAN_DAY_OPTIONS.map((d) => (
                <button key={d} type="button" aria-pressed={form.days === d} onClick={() => setForm((f) => ({ ...f, days: d }))}
                  className={`flex-1 min-h-[38px] rounded-lg border text-[13px] font-semibold ${form.days === d ? 'border-accent bg-accent/15 text-white' : 'border-white/10 bg-surface text-text-secondary'}`}>
                  {d}
                </button>
              ))}
            </div>
          </label>

          <div>
            <p className="text-[11px] text-text-tertiary mb-1">Programs on offer — tick to give it a page, star the one the bare /free-plan link shows</p>
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
              {programs.map((p) => {
                const offer = form.offers.find((o) => o.id === p.id);
                const auto = offerCopy({ headline: '', subheadline: '' }, p, form.days);
                const isDefault = form.programId === p.id;
                const expanded = open === p.id;
                return (
                  <li key={p.id} className="bg-surface">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <input type="checkbox" checked={Boolean(offer)} onChange={() => toggleOffer(p)} className="w-4 h-4 accent-[var(--accent)] flex-shrink-0" aria-label={`Offer ${p.name}`} />
                      <button type="button" onClick={() => offer && setOpen(expanded ? null : p.id)} disabled={!offer}
                        className={`flex-1 min-w-0 text-left text-sm font-semibold truncate ${offer ? 'text-white' : 'text-text-tertiary'}`}>
                        {p.name}
                        {!p.hasWeekOne && (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-red-400" title="No sessions in week one: the page renders but signup fails. Add a schedule in the builder.">
                            No week-one sessions
                          </span>
                        )}
                      </button>
                      {offer && (
                        <>
                          <button type="button" onClick={() => setForm((f) => ({ ...f, programId: p.id }))} aria-pressed={isDefault} title="Show this one on /free-plan"
                            className={`text-[11px] px-2 py-1 rounded-md border ${isDefault ? 'border-accent text-accent' : 'border-white/10 text-text-tertiary hover:text-white'}`}>
                            {isDefault ? 'Default' : 'Make default'}
                          </button>
                          <button type="button" onClick={() => copyLink(offerPath(p))} title="Copy this program's page link"
                            className="text-text-tertiary hover:text-white p-1.5 rounded-md" aria-label={`Copy link for ${p.name}`}>
                            <LinkIcon className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded} className="text-text-tertiary hover:text-white p-1.5 rounded-md" aria-label="Edit copy">
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          </button>
                        </>
                      )}
                    </div>
                    {offer && expanded && (
                      <div className="px-3 pb-3 space-y-2 bg-black/20">
                        <Field label="Headline (blank = the one shown as placeholder)" value={offer.headline} placeholder={auto.headline} onChange={(v) => editOffer(p.id, { headline: v })} />
                        <Field label="Line under it" value={offer.subheadline} placeholder={auto.subheadline} onChange={(v) => editOffer(p.id, { subheadline: v })} />
                        <a href={offerPath(p)} target="_blank" rel="noreferrer" className="text-xs text-text-tertiary hover:text-white inline-flex items-center gap-1">
                          Open this page <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => copyLink('/free-plan/pick')} className="text-xs text-text-tertiary hover:text-white inline-flex items-center gap-1 px-2 py-2">
              <LinkIcon className="w-3 h-3" /> Copy chooser link
            </button>
            <a href="/free-plan/pick" target="_blank" rel="noreferrer" className="text-xs text-text-tertiary hover:text-white inline-flex items-center gap-1 px-2 py-2">
              Open chooser <ExternalLink className="w-3 h-3" />
            </a>
            <Button size="sm" onClick={save} loading={saving} disabled={!canSave}>
              <Check className="w-3.5 h-3.5" /> Save
            </Button>
          </div>
          {form.enabled && form.offers.length === 0 && <p className="text-[11px] text-yellow-400">Tick at least one program before switching it on.</p>}
          {(() => {
            const broken = form.offers.filter((o) => programs.find((p) => p.id === o.id)?.hasWeekOne === false).map((o) => o.name);
            return broken.length > 0 ? (
              <p className="text-[11px] text-red-400">
                No week-one sessions, signup will fail: {broken.join(', ')}. Add a schedule in the program builder or untick them.
              </p>
            ) : null;
          })()}
          <p className="text-[11px] text-text-tertiary">Links only work after you save. Copy is generated from each program&apos;s goal unless you write your own.</p>
        </div>
      )}
    </Card>
  );
}

/** One message to an audience. Queued; the hourly cron sends it a page at a time. */
function BroadcastCard() {
  const { user } = useAuth();
  const [audience, setAudience] = useState<BroadcastAudience>('members');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaPath, setCtaPath] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [past, setPast] = useState<{ id: string; subject: string; audience: string; status: string; sentCount: number }[]>([]);

  const loadPast = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(8)));
      setPast(snap.docs.map((d) => ({ id: d.id, ...(d.data() as { subject: string; audience: string; status: string; sentCount: number }) })));
    } catch { /* first use: nothing yet */ }
  }, []);
  useEffect(() => { loadPast(); }, [loadPast]);

  async function send() {
    if (!user) return;
    setSending(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience, subject, body, ctaLabel, ctaPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success('Queued — it goes out on the next hourly run');
      setSubject(''); setBody(''); setCtaLabel(''); setCtaPath(''); setConfirm(false);
      loadPast();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSending(false); }
  }

  const ready = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <Card className="p-4 lg:p-5 space-y-3">
      <div>
        <p className="text-sm font-bold text-white flex items-center gap-2"><Megaphone className="w-4 h-4 text-accent" /> Send to everyone</p>
        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
          Announce a program, a change, an offer. Goes out on the next hourly run with a one-click unsubscribe, never to anyone who has opted out.
        </p>
      </div>
      <label className="text-[11px] text-text-tertiary block">
        Audience
        <select value={audience} onChange={(e) => setAudience(e.target.value as BroadcastAudience)}
          className="mt-1 w-full bg-surface border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-accent/50">
          {BROADCAST_AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
        </select>
      </label>
      <Field label="Subject" value={subject} placeholder="New program: Ironclad" onChange={setSubject} />
      <label className="block text-[11px] text-text-tertiary">
        Body (one paragraph per line)
        <textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What it is, who it is for, one line on why now."
          className="mt-1 w-full bg-surface border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white placeholder:text-text-tertiary/60 focus:outline-none focus:border-accent/50" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Button text (optional)" value={ctaLabel} placeholder="Open the app" onChange={setCtaLabel} />
        <Field label="Button link (on this site)" value={ctaPath} placeholder="/training" onChange={setCtaPath} />
      </div>
      {confirm ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-white">Send &ldquo;{subject.trim()}&rdquo; to <span className="font-bold">{AUDIENCE_LABELS[audience].toLowerCase()}</span>? This cannot be recalled.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirm(false)} className="text-xs text-text-tertiary hover:text-white px-2 py-2">Cancel</button>
            <Button size="sm" variant="danger" onClick={send} loading={sending}><Send className="w-3.5 h-3.5" /> Yes, send</Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setConfirm(true)} disabled={!ready}><Send className="w-3.5 h-3.5" /> Send…</Button>
        </div>
      )}
      {past.length > 0 && (
        <div className="pt-2 border-t border-white/10 space-y-1">
          {past.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-white truncate">{p.subject}</span>
              <span className="text-text-tertiary flex-shrink-0 tabular-nums">{AUDIENCE_LABELS[p.audience as BroadcastAudience] ?? p.audience} · {p.status} · {p.sentCount ?? 0} sent</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
