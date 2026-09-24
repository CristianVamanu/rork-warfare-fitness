'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, Loader2, Eye, EyeOff, Sparkles, Lock } from 'lucide-react';
import { getMembershipConfig, getMembershipPlans, getSystemConfig } from '@/lib/firestore';
import { getPlanBillingPeriods, planHasAnyPrice, getActiveDiscountPercent, applyDiscount } from '@/lib/utils';
import { offerWords, revealCopy, whyThisFits, athleteLabel, firstName, type OfferWords, type Blocker } from '@/lib/onboardingIntake';
import type { MatchedProgram } from '@/lib/programMatch';
import type { MembershipConfig, MembershipPlan, FitnessGoal, EquipmentType, ExperienceLevel } from '@/types';
import type { WeightGoalTimeline } from '@/lib/tdee';

/**
 * The reveal, before the account exists.
 *
 * This is the page the quiz was for. It names the person, names the
 * program their answers earned, says why in their own terms, shows the
 * offer in plain figures, and asks for one thing: a password. The
 * account is created only when they press the button, by the same
 * handleFinish the quiz has always used, and the program enrolled is the
 * one on this screen — never a second match.
 *
 * No membership configured, or no plan with a price: the offer block is
 * absent and the button simply starts training, which is what the old
 * account step did.
 */

export interface RevealOfferProps {
  name: string;
  goal: FitnessGoal | null;
  equipment: EquipmentType | null;
  experience: ExperienceLevel | null;
  trainingDays: number | null;
  blocker: Blocker | null;
  trainingFor: import('@/lib/onboardingIntake').TrainingFor | null;
  match: MatchedProgram | null;
  matchState: 'idle' | 'loading' | 'ready' | 'failed';
  options: MatchedProgram[];
  onPick: (p: MatchedProgram) => void;
  timeline: WeightGoalTimeline | null;
  weightUnit: 'kg' | 'lbs';
  busy: boolean;
  error: string | null;
  /** The plan clicked on the landing page, if any. Wins over the default pick. */
  preferredPlanId?: string | null;
  /** Called with the password; the parent creates the account and, when the offer says so, goes to checkout. */
  onStart: (password: string, plan: { id: string; months: 1 | 3 | 6 | 12 } | null, offer: OfferWords) => void;
}

export function RevealOffer(p: RevealOfferProps) {
  const [cfg, setCfg] = useState<MembershipConfig | null>(null);
  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [copy, setCopy] = useState(() => revealCopy(null));
  const [loaded, setLoaded] = useState(false);
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getMembershipConfig().catch(() => null),
      getMembershipPlans().catch(() => [] as MembershipPlan[]),
      getSystemConfig().catch(() => null),
    ]).then(([c, plans, sys]) => {
      if (!alive) return;
      setCfg(c);
      const live = plans.filter((x) => x.active && planHasAnyPrice(x));
      setPlan(
        (p.preferredPlanId ? live.find((x) => x.id === p.preferredPlanId) : undefined)
        ?? live.find((x) => x.mostPopular) ?? live[0] ?? null,
      );
      setCopy(revealCopy(sys as { onboardingCopy?: { whyPrice?: unknown; offerStack?: unknown } } | null));
    }).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.preferredPlanId]);

  const period = plan ? getPlanBillingPeriods(plan)[0] : undefined;
  const discount = getActiveDiscountPercent(cfg);
  const offer = offerWords(cfg, period ? { price: period.price, months: period.months } : null);
  const first = firstName(p.name);
  const label = athleteLabel(p.goal, p.trainingFor);
  const showing = p.matchState === 'ready' && !!p.match;
  const reasons = p.match ? whyThisFits({
    goal: p.goal, equipment: p.equipment, experience: p.experience, trainingDays: p.trainingDays,
    blocker: p.blocker, programName: p.match.name, commitment: p.match.marketing?.commitment,
  }) : [];
  const passwordOk = password.length >= 8;

  function start() {
    if (!passwordOk || p.busy) return;
    p.onStart(password, plan && period ? { id: plan.id, months: period.months } : null, offer);
  }

  function openPassword() {
    setShowPassword(true);
    // The panel lives in the match card at the top; bring it into view so
    // the keyboard opens where the person is looking.
    requestAnimationFrame(() => document.getElementById('reveal-cta')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  const cta = (
    <div className="space-y-2" id="reveal-cta">
      {!showPassword ? (
        <button
          type="button"
          onClick={openPassword}
          disabled={p.busy}
          className="w-full min-h-[56px] rounded-2xl bg-gradient-accent text-black text-base font-black flex items-center justify-center gap-2 shadow-glow-sm hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
        >
          {offer.button} <ChevronRight className="w-4 h-4" />
        </button>
      ) : (
        <div className="rounded-2xl border border-accent/30 bg-surface p-4 space-y-3 wf-rise">
          <p className="text-sm font-bold text-white">Set a password to keep your program</p>
          <div className="relative">
            <input
              type={reveal ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              autoComplete="new-password"
              onKeyDown={(e) => { if (e.key === 'Enter') start(); }}
              className="w-full bg-background border border-white/10 rounded-xl pl-3 pr-12 py-3 text-white text-base placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
            />
            <button type="button" onClick={() => setReveal((v) => !v)} aria-label={reveal ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 px-3 flex items-center text-text-tertiary hover:text-white">
              {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={start}
            disabled={!passwordOk || p.busy}
            className="w-full min-h-[52px] rounded-xl bg-gradient-accent text-black text-base font-black flex items-center justify-center gap-2 shadow-glow-sm disabled:opacity-60"
          >
            {p.busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up your program…</> : <>{offer.kind === 'none' ? 'Create account & start' : `Create account · ${offer.button}`} <ChevronRight className="w-4 h-4" /></>}
          </button>
          <p className="text-[11px] text-text-tertiary text-center leading-relaxed">
            {p.name.trim() ? `${p.name.trim()} · ` : ''}By continuing you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent underline">Terms</a> and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent underline">Privacy Policy</a>.
          </p>
        </div>
      )}
      {offer.line && <p className="wf-readout text-[10px] font-bold text-text-tertiary text-center">{offer.line}</p>}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-8 pb-32 wf-rise">
      {/* Headline: the person, then the verdict. */}
      <p className="wf-readout text-[10px] font-bold text-accent text-center flex items-center justify-center gap-1.5">
        <Sparkles className="w-3 h-3" /> Matched to how you train
      </p>
      <h1 className="text-[28px] sm:text-4xl font-black text-white tracking-tight leading-[1.08] text-center mt-3 text-balance">
        {showing && p.match
          ? <>{first ? `${first}, you're ` : "You're "}{/^[aeiou]/i.test(p.match.name) ? 'an' : 'a'} <span className="wf-lit">{p.match.name}</span> athlete.</>
          : <>{first ? `${first}, you're a ` : "You're a "}<span className="wf-lit">{label}</span> athlete.</>}
      </h1>

      {/* The match card. */}
      <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-surface mt-6 p-5">
        <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
        <div aria-hidden className="wf-dots pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          {p.matchState === 'loading' && (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
              <p className="text-sm text-text-secondary">Matching you to a program…</p>
            </div>
          )}
          {p.matchState === 'failed' && (
            <p className="text-sm text-text-secondary leading-relaxed">
              We will match your program the moment your account is created. Everything you answered is kept.
            </p>
          )}
          {showing && p.match && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="wf-readout text-[10px] font-bold text-accent">{p.options[0] && p.match.id !== p.options[0].id ? 'Your pick' : 'Your match'}</p>
                  <p className="text-2xl font-black text-white leading-tight mt-1">{p.match.name}</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-secondary border border-white/15 rounded-lg px-2 py-1 flex-shrink-0">
                  {p.experience ?? 'matched'}
                </span>
              </div>
              {p.match.marketing?.hook && <p className="text-[14px] text-text-secondary leading-relaxed mt-3">{p.match.marketing.hook}</p>}
              <div className="mt-4">{cta}</div>
              {reasons.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/10">
                  <p className="wf-readout text-[10px] font-bold text-accent">Why this one fits you</p>
                  <ul className="mt-3 space-y-3">
                    {reasons.map((r) => (
                      <li key={r} className="flex items-start gap-2.5 text-[14px] text-text-secondary leading-relaxed">
                        <span className="w-5 h-5 rounded-full border border-accent/50 text-accent flex items-center justify-center flex-shrink-0 mt-0.5"><Check className="w-3 h-3" /></span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {p.timeline && p.timeline.weeksToGoal > 0 && (
                <p className="text-[13px] text-text-secondary leading-relaxed mt-4 pt-4 border-t border-white/10">
                  On this program you reach your goal weight in about <span className="text-white font-bold">{p.timeline.monthsToGoal} month{p.timeline.monthsToGoal !== 1 ? 's' : ''}</span>, at a pace that keeps the muscle.
                </p>
              )}
              {p.options.length > 1 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="wf-readout text-[10px] font-bold text-text-tertiary">Also fits you</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {p.options.filter((o) => o.id !== p.match!.id).map((o) => (
                      <button key={o.id} type="button" onClick={() => p.onPick(o)} className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-background text-[13px] font-semibold text-text-secondary hover:border-accent/40 hover:text-white transition-colors">
                        {o.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {!showing && p.matchState !== 'loading' && <div className="mt-4">{cta}</div>}
        </div>
      </div>

      {p.error && (
        <div className="mt-3 text-sm text-red-400 text-center bg-red-400/10 border border-red-400/20 rounded-xl p-3">{p.error}</div>
      )}

      {/* The offer, only when there is one. */}
      {loaded && offer.kind !== 'none' && (
        <>
          <div className="grid grid-cols-3 gap-2 mt-6">
            {offer.boxes.map((b) => (
              <div key={b.title} className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="wf-readout text-[9px] font-bold text-accent">{b.title}</p>
                <p className="text-[11px] text-text-secondary leading-snug mt-1.5">{b.body}</p>
              </div>
            ))}
          </div>

          {plan && period && (
            <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-surface mt-4 p-5">
              <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
              <div className="relative flex items-end justify-between gap-3">
                <div>
                  <p className="wf-readout text-[10px] font-bold text-accent">{plan.name}</p>
                  {offer.kind === 'paid-trial' ? (
                    <p className="text-4xl font-black text-white mt-1">${((cfg?.trialPriceCents ?? 100) / 100).toFixed(0)}<span className="text-base text-text-tertiary font-bold ml-1">today</span></p>
                  ) : (
                    <p className="text-4xl font-black text-white mt-1">${period.price.toFixed(0)}<span className="text-base text-text-tertiary font-bold ml-1">{period.months === 1 ? '/mo' : `/ ${period.months}mo`}</span></p>
                  )}
                </div>
                <div className="text-right">
                  {offer.kind === 'paid-trial' && <p className="text-sm text-text-secondary"><span className="line-through text-text-tertiary">${period.price.toFixed(0)}</span> first {cfg?.trialDays ?? 30} days</p>}
                  {discount > 0 && offer.kind !== 'paid-trial' && <p className="text-sm text-text-secondary">First payment ${applyDiscount(period.price, discount).toFixed(2)}, {discount}% off</p>}
                  <p className="wf-readout text-[9px] font-bold text-text-tertiary mt-1">cancel in the app anytime</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="wf-readout text-[10px] font-bold text-accent">What you get</p>
            <ul className="mt-3 space-y-3">
              {copy.offerStack.map((s) => (
                <li key={s.title} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full border border-accent/50 text-accent flex items-center justify-center flex-shrink-0 mt-0.5"><Check className="w-3.5 h-3.5" /></span>
                  <div>
                    <p className="text-sm font-bold text-white leading-tight">{s.title}</p>
                    {s.body && <p className="text-[13px] text-text-secondary leading-relaxed mt-0.5">{s.body}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {offer.kind === 'paid-trial' && (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 mt-6">
              <p className="text-sm font-bold text-white flex items-center gap-2"><Lock className="w-4 h-4 text-accent" /> Why ${((cfg?.trialPriceCents ?? 100) / 100).toFixed(0)}?</p>
              <p className="text-[13px] text-text-secondary leading-relaxed mt-2">{copy.whyPrice}</p>
            </div>
          )}

          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={openPassword}
              disabled={p.busy}
              className="w-full min-h-[56px] rounded-2xl bg-gradient-accent text-black text-base font-black flex items-center justify-center gap-2 shadow-glow-sm hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60"
            >
              {offer.button} <ChevronRight className="w-4 h-4" />
            </button>
            {offer.line && <p className="wf-readout text-[10px] font-bold text-text-tertiary text-center">{offer.line}</p>}
          </div>
        </>
      )}

      <p className="text-[11px] text-text-tertiary leading-relaxed text-center mt-8">
        Programs are general fitness programs inspired by military training. Not affiliated with, endorsed by, or connected to any armed force or government.
      </p>
    </div>
  );
}
