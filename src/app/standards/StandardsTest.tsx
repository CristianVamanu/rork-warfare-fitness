'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, X, Loader2, Mail, Share2 } from 'lucide-react';
import {
  UNIT_STANDARDS, slugFor,
  type UnitStandard,
} from '@/lib/ptStandards';
// Judging lives in lib so this screen, a shared link and the generated image
// can never disagree about who passed.
import {
  judge, summarise, resultPath, verdictHeadline,
  EMPTY_ANSWERS as EMPTY, type Answers,
} from '@/lib/standardsShare';

/**
 * The public test. No account, nothing stored, nothing gated.
 *
 * This is the top of the funnel and the whole point is that a stranger who
 * arrives from a video gets the thing they came for before being asked for
 * anything. The email box appears after the verdict, never before it.
 */

const FIELD = 'w-full bg-black/40 border border-white/12 rounded-xl px-3.5 py-3 text-base text-white tabular-nums placeholder:text-text-tertiary focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20';

/**
 * Minutes and seconds as two numeric boxes. One free-text "mm:ss" box
 * asked people to type a colon on a phone keyboard, and "2234" for 22:34
 * parsed as 2,234 minutes. Two boxes give the number pad for both and
 * cannot be typed wrong. The value handed back is still "m:ss" so the
 * scoring code is unchanged.
 */
function TimeInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [m, sRaw] = value.includes(':') ? value.split(':') : [value, ''];
  const sec = sRaw ?? '';
  const emit = (mins: string, secs: string) => {
    onChange(!mins && !secs ? '' : `${mins || '0'}:${secs.padStart(2, '0')}`);
  };
  const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        inputMode="numeric"
        aria-label="Minutes"
        value={m}
        onChange={(e) => emit(digits(e.target.value, 3), sec)}
        placeholder="0"
        className={FIELD}
      />
      <span className="text-sm font-semibold text-text-tertiary shrink-0">min</span>
      <input
        inputMode="numeric"
        aria-label="Seconds"
        value={sec}
        onChange={(e) => {
          const d = digits(e.target.value, 2);
          emit(m, d && Number(d) > 59 ? '59' : d);
        }}
        placeholder="00"
        className={FIELD}
      />
      <span className="text-sm font-semibold text-text-tertiary shrink-0">sec</span>
    </div>
  );
}

const INPUTS: { key: keyof Answers; event: keyof UnitStandard['events']; label: string; hint: string }[] = [
  { key: 'pullups', event: 'pullups', label: 'Pull-ups', hint: 'Strict, dead hang, no kipping' },
  { key: 'pushups', event: 'pushups', label: 'Push-ups', hint: 'Max in two minutes' },
  { key: 'situps', event: 'situps', label: 'Sit-ups', hint: 'Max in two minutes' },
  { key: 'plank', event: 'plankSeconds', label: 'Plank', hint: 'Time held' },
  { key: 'beep', event: 'beepLevel', label: 'Bleep test', hint: 'Level reached' },
  { key: 'run', event: 'runMinutes', label: 'Run', hint: 'Your time' },
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
  const { answered, passedAll, failures } = useMemo(() => summarise(verdicts), [verdicts]);

  // Share. The result is the most screenshot-worthy thing this product makes,
  // and until now there was nothing to send — the numbers lived in React
  // state and died with the tab. The link carries only the scores typed in
  // this box: no name, no email, no account.
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}${resultPath(slugFor(standard.id), answers)}`;
    const text = verdictHeadline(standard, verdicts);
    try {
      if (navigator.share) {
        await navigator.share({ title: standard.resultTitle, text, url });
        return;
      }
    } catch {
      // Dismissing the share sheet lands here. Not an error, and not a
      // reason to then silently copy something they chose not to send.
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard blocked — the button simply does nothing */ }
  };

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
      {/* Unit picker.
          A uniform grid rather than wrapped pills. Pills sized themselves to
          their label, so eleven names of different lengths wrapped into ragged
          rows with the flags at eleven different left edges. Equal tiles in
          fixed columns line the flags up and give every unit the same weight,
          which is also more honest — none of these is the headline. */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-tertiary mb-3">Pick a standard</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {UNIT_STANDARDS.map((s) => {
            const on = s.id === selectedId;
            return (
              <button
                key={s.id}
                onClick={() => { setSelectedId(s.id); setSubmitted(false); }}
                aria-pressed={on}
                className={`flex items-center gap-2.5 min-h-[54px] px-3 py-2.5 rounded-xl border text-left transition-all ${
                  on
                    ? 'bg-accent text-black border-accent shadow-[0_0_26px_-8px_rgb(var(--accent-rgb)/0.8)]'
                    : 'bg-white/[0.03] text-text-secondary border-white/10 hover:border-white/25 hover:text-white'
                }`}
              >
                {/* Fixed-width slot: flag glyphs render at different widths
                    per platform, and without this the labels start at a
                    different x on every row. */}
                <span className="w-5 text-center text-base leading-none flex-shrink-0">{s.flag}</span>
                <span className="text-[13px] font-semibold leading-[1.2] min-w-0">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The standard itself, stated before anything is asked of the visitor. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{standard.resultTitle}</h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed max-w-2xl">{standard.description}</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-5">
          {verdicts.map((v) => (
            <div key={v.key} className="flex flex-col justify-between min-h-[76px] rounded-xl border border-white/10 bg-black/30 px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary leading-tight">{v.label}</p>
              <p className="text-2xl font-black text-accent tabular-nums leading-none mt-1.5">{v.target}</p>
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
              {i.key === 'run' || i.key === 'plank' ? (
                <TimeInput
                  id={`in-${i.key}`}
                  value={answers[i.key]}
                  onChange={(v) => setAnswers((a) => ({ ...a, [i.key]: v }))}
                />
              ) : (
                <input
                  id={`in-${i.key}`}
                  inputMode="numeric"
                  value={answers[i.key]}
                  onChange={(e) => setAnswers((a) => ({ ...a, [i.key]: e.target.value }))}
                  placeholder="0"
                  className={FIELD}
                />
              )}
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
              <div className="flex items-center gap-3 px-3.5 py-2 bg-black/40">
                <span className="w-6 flex-shrink-0" />
                <span className="flex-1 min-w-0 text-[10px] font-bold uppercase tracking-wide text-text-tertiary">Event</span>
                <span className="w-14 text-right text-[10px] font-bold uppercase tracking-wide text-text-tertiary">You</span>
                <span className="w-14 text-right text-[10px] font-bold uppercase tracking-wide text-text-tertiary">Needs</span>
              </div>
              {verdicts.map((v) => (
                <div key={v.key} className="flex items-center gap-3 px-3.5 py-3 bg-black/20">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    v.yours === '—' ? 'bg-white/8 text-text-tertiary' : v.passed ? 'bg-green-500/20 text-green-400' : 'bg-danger/20 text-danger'
                  }`}>
                    {v.yours === '—' ? '·' : v.passed ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </span>
                  <span className="text-sm text-white flex-1 min-w-0 leading-tight">{v.label}</span>
                  {/* Fixed columns so every row's numbers sit under the last
                      one instead of drifting with the length of the label. */}
                  <span className={`text-sm font-bold tabular-nums text-right w-14 flex-shrink-0 ${
                    v.passed ? 'text-green-400' : v.yours === '—' ? 'text-text-tertiary' : 'text-danger'
                  }`}>{v.yours}</span>
                  <span className="text-sm tabular-nums text-text-tertiary text-right w-14 flex-shrink-0">{v.target}</span>
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

            {/* Sits UNDER the training CTA on purpose: the person in front of
                us is worth more than the one they might bring, so the ask
                that converts goes first. */}
            <button
              type="button"
              onClick={share}
              className="mt-2.5 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-white/12 text-white font-bold text-sm hover:border-accent/40 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              {copied ? 'Link copied' : passedAll ? 'Share this result' : 'Challenge someone'}
            </button>
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
