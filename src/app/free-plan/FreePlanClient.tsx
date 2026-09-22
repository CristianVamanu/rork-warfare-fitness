'use client';

import { useState } from 'react';
import { ArrowRight, Check, Mail } from 'lucide-react';

/**
 * The form half of /free-plan.
 *
 * Built to convert cold traffic on a phone: the headline, the field and the
 * button are all inside the first screen; the program card sits under the
 * fold as the thing you are about to get, not as a reason to keep reading.
 * There is one decision on the page. The tips checkbox is the only other
 * control and it is off by default — that is what makes it consent.
 *
 * Same surface vocabulary as the landing and the standards test (the ember
 * field, the readout eyebrow, the lit headline), so an ad that lands here
 * lands on the product, not a page that looks rented.
 */
export function FreePlanClient({
  headline, subheadline, days, program,
}: {
  headline: string;
  subheadline: string;
  days: number;
  program: { name: string; description: string; weeks: number; daysPerWeek: number; level: string; imageUrl: string | null };
}) {
  const [email, setEmail] = useState('');
  const [tips, setTips] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === 'sending') return;
    const addr = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(addr)) { setError('That does not look like an email address.'); return; }
    setError(null);
    setState('sending');
    try {
      const res = await fetch('/api/public/free-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr, marketingOptIn: tips }),
      });
      if (res.status === 429) throw new Error('Too many tries — give it a few minutes.');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error('Could not send it just now. Try again in a moment.');
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setState('error');
    }
  }

  const levelLabel = program.level.charAt(0).toUpperCase() + program.level.slice(1);

  return (
    <div className="max-w-lg mx-auto px-5 pt-10 pb-14 sm:pt-16">
      <p className="wf-readout text-[10px] font-bold text-accent mb-4">Free · {days} days · no account needed</p>
      <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.12] text-balance">
        <span className="wf-lit">{headline}</span>
      </h1>
      <p className="text-[15px] sm:text-base text-text-secondary leading-relaxed mt-4 text-balance">{subheadline}</p>

      {state === 'done' ? (
        <div className="mt-8 rounded-2xl border border-accent/40 bg-accent/[0.08] p-5 wf-rise">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-gradient-accent text-black flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4" />
            </span>
            <div>
              <p className="text-base font-black text-white">Day one is in your inbox.</p>
              <p className="text-sm text-text-secondary leading-relaxed mt-1">
                One session a morning for {days} days, straight from {program.name}. If it is not there in a minute, check spam and drag it out — that teaches your mail app the rest are wanted.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-3" noValidate>
          <label className="block">
            <span className="sr-only">Email address</span>
            <div className="relative">
              <Mail className="w-4 h-4 text-text-tertiary absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-surface border border-white/10 rounded-2xl pl-11 pr-4 py-4 text-base text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/60 focus:shadow-[0_0_0_4px_rgb(var(--accent-rgb)/0.15)] transition-shadow"
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={state === 'sending'}
            className="w-full min-h-[56px] rounded-2xl bg-gradient-accent text-black text-base font-black flex items-center justify-center gap-2 shadow-glow-sm hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
          >
            {state === 'sending' ? 'Sending day one…' : <>Send me day one <ArrowRight className="w-4 h-4" /></>}
          </button>
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          <label className="flex items-start gap-2.5 pt-1 text-[12px] text-text-tertiary leading-relaxed cursor-pointer">
            <input type="checkbox" checked={tips} onChange={(e) => setTips(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--accent)] flex-shrink-0" />
            <span>Also send me training tips and standards breakdowns after the {days} days. Optional. One click stops them.</span>
          </label>
          <p className="text-[11px] text-text-tertiary leading-relaxed text-center pt-1">
            {days} emails, one a day, then nothing unless you tick the box. Unsubscribe in any of them.
          </p>
        </form>
      )}

      {/* What they are about to receive — the real program, not a mockup. */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-surface mt-10 p-5">
        <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
        <div aria-hidden className="wf-dots pointer-events-none absolute inset-0" />
        <div className="relative">
          <p className="wf-readout text-[10px] font-bold text-accent">Taken from</p>
          <div className="flex items-start gap-4 mt-2">
            {program.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={program.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover border border-white/10 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-lg font-black text-white leading-tight">{program.name}</p>
              <p className="text-[12px] text-text-tertiary mt-1">
                {program.weeks} weeks · {program.daysPerWeek} days a week · {levelLabel}
              </p>
            </div>
          </div>
          <p className="text-[13px] text-text-secondary leading-relaxed mt-3 line-clamp-4">{program.description}</p>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              ['Real sessions', 'Sets, reps, rest — the actual week one'],
              ['One a morning', 'Nothing to plan or decide'],
              ['Then decide', `Keep going with all ${program.weeks} weeks, or don't`],
            ].map(([t, s]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="text-[12px] font-bold text-white leading-tight">{t}</p>
                <p className="text-[11px] text-text-tertiary leading-snug mt-1">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
