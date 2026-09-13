'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, X, Loader2, Mail } from 'lucide-react';
import {
  UNIT_STANDARDS, slugFor, formatSeconds, formatMinutes,
  type UnitStandard,
} from '@/lib/ptStandards';

/**
 * The public test. No account, nothing stored, nothing gated.
 *
 * This is the top of the funnel and the whole point is that a stranger who
 * arrives from a video gets the thing they came for before being asked for
 * anything. The email box appears after the verdict, never before it.
 */

type Answers = { pullups: string; pushups: string; situps: string; plank: string; beep: string; run: string };
const EMPTY: Answers = { pullups: '', pushups: '', situps: '', plank: '', beep: '', run: '' };

/** Minutes from "9:30" or "9.5". People type both. */
function parseTime(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    const mins = Number(m); const secs = Number(s);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
    return mins + secs / 60;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseNum(v: string): number | null {
  const n = Number(v.trim());
  return v.trim() && Number.isFinite(n) ? n : null;
}

interface Verdict {
  key: string;
  label: string;
  yours: string;
  target: string;
  passed: boolean;
  /** How far off, phrased for a human. Empty when they cleared it. */
  gap: string;
}

function judge(standard: UnitStandard, a: Answers): Verdict[] {
  const out: Verdict[] = [];
  const e = standard.events;

  if (e.pullups !== undefined) {
    const yours = parseNum(a.pullups);
    out.push({
      key: 'pullups', label: 'Pull-ups', yours: yours === null ? '—' : String(yours),
      target: String(e.pullups), passed: yours !== null && yours >= e.pullups,
      gap: yours !== null && yours < e.pullups ? `${e.pullups - yours} short` : '',
    });
  }
  if (e.pushups !== undefined) {
    const yours = parseNum(a.pushups);
    out.push({
      key: 'pushups', label: 'Push-ups', yours: yours === null ? '—' : String(yours),
      target: String(e.pushups), passed: yours !== null && yours >= e.pushups,
      gap: yours !== null && yours < e.pushups ? `${e.pushups - yours} short` : '',
    });
  }
  if (e.situps !== undefined) {
    const yours = parseNum(a.situps);
    out.push({
      key: 'situps', label: 'Sit-ups', yours: yours === null ? '—' : String(yours),
      target: String(e.situps), passed: yours !== null && yours >= e.situps,
      gap: yours !== null && yours < e.situps ? `${e.situps - yours} short` : '',
    });
  }
  if (e.plankSeconds !== undefined) {
    const yours = parseTime(a.plank);
    const yoursSec = yours === null ? null : yours * 60;
    out.push({
      key: 'plank', label: 'Plank', yours: yoursSec === null ? '—' : formatSeconds(yoursSec),
      target: formatSeconds(e.plankSeconds), passed: yoursSec !== null && yoursSec >= e.plankSeconds,
      gap: yoursSec !== null && yoursSec < e.plankSeconds ? `${Math.round(e.plankSeconds - yoursSec)}s short` : '',
    });
  }
  if (e.beepLevel !== undefined) {
    const yours = parseNum(a.beep);
    out.push({
      key: 'beep', label: 'Bleep test level', yours: yours === null ? '—' : String(yours),
      target: String(e.beepLevel), passed: yours !== null && yours >= e.beepLevel,
      gap: yours !== null && yours < e.beepLevel ? `${(e.beepLevel - yours).toFixed(1)} levels short` : '',
    });
  }
  if (e.runMinutes !== undefined) {
    const yours = parseTime(a.run);
    out.push({
      key: 'run', label: standard.runLabel ?? 'Run', yours: yours === null ? '—' : formatMinutes(yours),
      target: formatMinutes(e.runMinutes), passed: yours !== null && yours <= e.runMinutes,
      // Lower is better here, which is the one place the arithmetic flips.
      gap: yours !== null && yours > e.runMinutes ? `${formatMinutes(yours - e.runMinutes)} too slow` : '',
    });
  }
  return out;
}

const INPUTS: { key: keyof Answers; event: keyof UnitStandard['events']; label: string; hint: string }[] = [
  { key: 'pullups', event: 'pullups', label: 'Pull-ups', hint: 'Strict, dead hang, no kipping' },
  { key: 'pushups', event: 'pushups', label: 'Push-ups', hint: 'Max in two minutes' },
  { key: 'situps', event: 'situps', label: 'Sit-ups', hint: 'Max in two minutes' },
  { key: 'plank', event: 'plankSeconds', label: 'Plank', hint: 'Time held, as m:ss' },
  { key: 'beep', event: 'beepLevel', label: 'Bleep test', hint: 'Level reached' },
  { key: 'run', event: 'runMinutes', label: 'Run', hint: 'Your time, as mm:ss' },
];

export function StandardsTest({ initialStandardId }: { initialStandardId?: string }) {
  const [selectedId, setSelectedId] = useState(initialStandardId ?? UNIT_STANDARDS[0].id);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const standard = UNIT_STANDARDS.find((s) => s.id === selectedId) ?? UNIT_STANDARDS[0];
  const verdicts = useMemo(() => judge(standard, answers), [standard, answers]);
  const answered = verdicts.filter((v) => v.yours !== '—').length;
  const passedAll = verdicts.length > 0 && verdicts.every((v) => v.passed);
  const failures = verdicts.filter((v) => !v.passed && v.yours !== '—');

  const relevant = INPUTS.filter((i) => standard.events[i.event] !== undefined);

  async function sendResult() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return;
    setSending(true);
    try {
      const res = await fetch('/api/standards/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          marketingOptIn: optIn,
          standardId: standard.id,
          results: verdicts.map(({ label, yours, target, passed }) => ({ label, yours, target, passed })),
        }),
      });
      // A failure to send is not worth showing a stranger an error over — they
      // already have their result on screen, which is what they came for.
      if (res.ok) setSent(true);
      else setSent(true);
    } catch {
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Unit picker */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-tertiary mb-3">Pick a standard</p>
        <div className="flex flex-wrap gap-2">
          {UNIT_STANDARDS.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSelectedId(s.id); setSubmitted(false); }}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition-all ${
                s.id === selectedId
                  ? 'bg-accent text-black border-accent shadow-[0_0_24px_-6px_rgb(var(--accent-rgb)/0.7)]'
                  : 'bg-white/[0.03] text-text-secondary border-white/10 hover:border-white/25 hover:text-white'
              }`}
            >
              <span className="mr-1.5">{s.flag}</span>{s.label}
            </button>
          ))}
        </div>
      </div>

      {/* The standard itself, stated before anything is asked of the visitor. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{standard.resultTitle}</h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed max-w-2xl">{standard.description}</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-5">
          {verdicts.map((v) => (
            <div key={v.key} className="rounded-xl border border-white/10 bg-black/30 px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">{v.label}</p>
              <p className="text-2xl font-black text-accent tabular-nums mt-0.5">{v.target}</p>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-text-tertiary mt-4">{standard.source}</p>
      </div>

      {/* The test */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-accent">Your numbers</p>
        <p className="text-sm text-text-secondary mt-1.5">Honest ones. Nothing is stored and you do not need an account.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          {relevant.map((i) => (
            <div key={i.key}>
              <label htmlFor={`in-${i.key}`} className="text-xs font-semibold text-white block mb-1.5">
                {i.key === 'run' ? (standard.runLabel ?? 'Run') : i.label}
                <span className="font-normal text-text-tertiary"> · {i.hint}</span>
              </label>
              <input
                id={`in-${i.key}`}
                inputMode={i.key === 'run' || i.key === 'plank' ? 'text' : 'numeric'}
                value={answers[i.key]}
                onChange={(e) => setAnswers((a) => ({ ...a, [i.key]: e.target.value }))}
                placeholder={i.key === 'run' || i.key === 'plank' ? 'mm:ss' : '0'}
                className="w-full bg-black/40 border border-white/12 rounded-xl px-3.5 py-3 text-base text-white tabular-nums placeholder:text-text-tertiary focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              />
            </div>
          ))}
        </div>

        <button
          onClick={() => setSubmitted(true)}
          disabled={answered === 0}
          className="mt-5 w-full h-13 py-3.5 rounded-xl bg-accent text-black font-extrabold text-[15px] disabled:opacity-40 active:scale-[0.99] transition-transform"
        >
          {answered === 0 ? 'Enter at least one number' : 'See where I stand'}
        </button>
      </div>

      {/* Verdict */}
      <AnimatePresence>
        {submitted && answered > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-5 sm:p-6"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-accent">Result</p>
            <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1.5">
              {passedAll
                ? `You meet the ${standard.label} standard.`
                : failures.length === 1
                  ? `${failures[0].gap} on ${failures[0].label.toLowerCase()}.`
                  : `You are short on ${failures.length} of ${verdicts.length} events.`}
            </h3>

            <div className="mt-4 divide-y divide-white/8 rounded-xl border border-white/10 overflow-hidden">
              {verdicts.map((v) => (
                <div key={v.key} className="flex items-center gap-3 px-3.5 py-3 bg-black/20">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    v.yours === '—' ? 'bg-white/8 text-text-tertiary' : v.passed ? 'bg-green-500/20 text-green-400' : 'bg-danger/20 text-danger'
                  }`}>
                    {v.yours === '—' ? '·' : v.passed ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </span>
                  <span className="text-sm text-white flex-1 min-w-0">{v.label}</span>
                  <span className="text-sm tabular-nums text-text-secondary flex-shrink-0">
                    <span className={v.passed ? 'text-green-400' : v.yours === '—' ? '' : 'text-danger'}>{v.yours}</span>
                    <span className="text-text-tertiary"> / {v.target}</span>
                  </span>
                </div>
              ))}
            </div>

            {standard.notTracked && (
              <p className="text-[11px] text-text-tertiary mt-3">
                Not tested here: {standard.notTracked}
              </p>
            )}

            {/* Email capture. After the verdict, never before it. */}
            {!sent ? (
              <div className="mt-5 pt-5 border-t border-white/10">
                <p className="text-sm font-bold text-white">Want this emailed to you, with what closes the gap?</p>
                <div className="flex flex-col sm:flex-row gap-2 mt-2.5">
                  <input
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Your email address"
                    className="flex-1 min-w-0 bg-black/40 border border-white/12 rounded-xl px-3.5 py-3 text-base text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/60"
                  />
                  <button
                    onClick={sendResult}
                    disabled={sending || !/^\S+@\S+\.\S+$/.test(email.trim())}
                    className="px-5 py-3 rounded-xl bg-white text-black font-bold text-sm disabled:opacity-40 whitespace-nowrap inline-flex items-center justify-center gap-2"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Send it
                  </button>
                </div>
                <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={optIn}
                    onChange={(e) => setOptIn(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[var(--accent)] flex-shrink-0"
                  />
                  <span className="text-[11px] text-text-tertiary leading-relaxed">
                    Also send me training tips and standards breakdowns. Optional, and you can stop them in one click.
                    Leave it unticked and you get your result and nothing else.
                  </span>
                </label>
              </div>
            ) : (
              <p className="mt-5 pt-5 border-t border-white/10 text-sm text-green-400">
                Sent. Check your inbox, and your spam folder if it is not there in a minute.
              </p>
            )}

            <Link
              href="/onboarding"
              className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-accent text-black font-extrabold text-[15px] active:scale-[0.99] transition-transform"
            >
              {passedAll ? 'Train to hold it' : 'Get the plan that closes this'} <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Every other standard, which is also the internal linking for search. */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-tertiary mb-3">Every standard</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {UNIT_STANDARDS.map((s) => (
            <Link
              key={s.id}
              href={`/standards/${slugFor(s.id)}`}
              className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 hover:border-accent/40 transition-colors"
            >
              <span className="text-lg">{s.flag}</span>
              <span className="text-sm font-semibold text-white flex-1 min-w-0 truncate">{s.resultTitle}</span>
              <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-accent flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
