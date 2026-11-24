'use client';

import { nativeBillingBlocked } from '@/lib/native/billing';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Loader2, Eye, EyeOff, Sparkles, Lock } from 'lucide-react';
import { getMembershipConfig, getMembershipPlans, getSystemConfig } from '@/lib/firestore';
import { freePlanConfig } from '@/lib/freePlan';
import { getPlanBillingPeriods, planHasAnyPrice, getActiveDiscountPercent, applyDiscount } from '@/lib/utils';
import { formatMoney } from '@/lib/trialReminder';
import { offerWords, revealCopy, whyThisFits, athleteLabel, firstName, shortProgramName, type OfferWords, type Blocker } from '@/lib/onboardingIntake';
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
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [copy, setCopy] = useState(() => revealCopy(null));
  const [loaded, setLoaded] = useState(false);
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // The same tick the register page asks for: terms, 18+, fit to train. The
  // quiz used to create accounts on an implied "by continuing you agree"
  // line, so nobody who signed up this way had actually accepted anything.
  const [agreed, setAgreed] = useState(false);
  const [freePlanOn, setFreePlanOn] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getMembershipConfig().catch(() => null),
      getMembershipPlans().catch(() => [] as MembershipPlan[]),
      getSystemConfig().catch(() => null),
    ]).then(([c, plans, sys]) => {
      if (!alive) return;
      setCfg(c);
      // Inside the phone apps nothing is sold (Google Play payments policy):
      // no plan, no price, no subscribe button. The button just creates the
      // account and starts training.
      const live = nativeBillingBlocked() ? [] : plans.filter((x) => x.active && planHasAnyPrice(x));
      // Lead with the lowest price a person can start on, so the number on
      // this screen is never the yearly total by surprise. The yearly plan
      // is offered beside it as the saver, and a plan clicked on the landing
      // page still wins.
      const cheapestFirst = [...live].sort((a, b) => (getPlanBillingPeriods(a)[0]?.price ?? 0) - (getPlanBillingPeriods(b)[0]?.price ?? 0));
      setPlans(cheapestFirst);
      setPlan(
        (p.preferredPlanId ? live.find((x) => x.id === p.preferredPlanId) : undefined)
        ?? cheapestFirst[0] ?? null,
      );
      setCopy(revealCopy(sys as { onboardingCopy?: { whyPrice?: unknown; offerStack?: unknown } } | null));
      const fp = freePlanConfig(sys as Parameters<typeof freePlanConfig>[0]);
      setFreePlanOn(fp.enabled && fp.offers.length > 0);
    }).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.preferredPlanId]);

  const period = plan ? getPlanBillingPeriods(plan)[0] : undefined;
  const discount = getActiveDiscountPercent(cfg);
  // The plan's own currency, the same one Stripe charges in (plan-checkout).
  const money = (major: number) => formatMoney(Math.round(major * 100), plan?.currency ?? 'USD');
  const offer = offerWords(cfg, period ? { price: period.price, months: period.months } : null);
  const first = firstName(p.name);
  const label = athleteLabel(p.goal, p.trainingFor);
  const showing = p.matchState === 'ready' && !!p.match;
  const reasons = p.match ? whyThisFits({
    goal: p.goal, equipment: p.equipment, experience: p.experience, trainingDays: p.trainingDays,
    blocker: p.blocker, programName: shortProgramName(p.match.name), commitment: p.match.marketing?.commitment,
  }) : [];
  const passwordOk = password.length >= 8;

  function start() {
    if (!passwordOk || !agreed || p.busy) return;
    p.onStart(password, plan && period ? { id: plan.id, months: period.months } : null, offer);
  }

  function openPassword() {
    setShowPassword(true);
    // The panel lives in the match card at the top; bring it into view so
    // the keyboard opens where the person is looking.
    requestAnimationFrame(() => document.getElementById('reveal-cta')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  // The price sits directly above the Start button: nobody is asked to
  // start before they have seen what it costs afterwards.
  const planPicker = loaded && offer.kind !== 'none' && plan && period ? (
    <div>
              <p className="wf-readout text-[10px] font-bold text-accent">
                {offer.kind === 'free-trial' ? `After your ${cfg?.trialDays ?? 7} free days, if you stay` : 'Choose your plan'}
              </p>
              <div className="mt-3 space-y-2" role="radiogroup" aria-label="Plan">
                {plans.map((pl) => {
                  const per = getPlanBillingPeriods(pl)[0];
                  if (!per) return null;
                  const on = pl.id === plan.id;
                  const monthlyBase = getPlanBillingPeriods(plans[0])[0];
                  const perMonth = per.price / per.months;
                  const saved = per.months > 1 && monthlyBase?.months === 1 ? monthlyBase.price * per.months - per.price : 0;
                  return (
                    <button
                      key={pl.id} type="button" role="radio" aria-checked={on} onClick={() => setPlan(pl)}
                      className={`w-full text-left rounded-2xl border p-4 flex items-center gap-3 transition ${on ? 'border-accent bg-accent/[0.08]' : 'border-white/10 bg-surface'}`}
                    >
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${on ? 'border-accent' : 'border-white/25'}`}>
                        {on && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-white">{pl.name}</span>
                          <span className="px-2 py-0.5 rounded-full border border-white/15 text-[10px] font-bold text-text-secondary uppercase tracking-wide">
                            {per.months === 1 ? 'Monthly' : per.months === 12 ? 'Yearly' : `Every ${per.months} months`}
                          </span>
                          {saved > 0 && <span className="px-2 py-0.5 rounded-full bg-accent text-black text-[10px] font-bold">Save {money(Math.round(saved))}</span>}
                        </span>
                        <span className="block text-[12px] text-text-secondary mt-1">
                          {per.months === 1 ? 'Pay month by month. Cancel anytime.' : `One payment of ${money(per.price)} a year. Works out at ${money(perMonth)} a month.`}
                        </span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span className="block text-lg font-black text-white tabular-nums leading-none">{money(per.price)}</span>
                        <span className="block text-[11px] text-text-tertiary mt-1">{per.months === 1 ? 'per month' : per.months === 12 ? 'per year' : `per ${per.months} months`}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px] text-text-secondary mt-3 text-center">
                {offer.kind === 'free-trial'
                  ? <><b className="text-white">Nothing to pay today and no card needed.</b> You only choose and pay if you decide to stay.</>
                  : offer.kind === 'paid-trial'
                    ? <>Today you pay {money((cfg?.trialPriceCents ?? 100) / 100)}. The plan price starts after {cfg?.trialDays ?? 30} days.</>
                    : discount > 0 ? <>First payment {money(applyDiscount(period.price, discount))}, {discount}% off. Cancel in the app anytime.</> : <>Cancel in the app anytime.</>}
              </p>
            </div>
  ) : null;

  const cta = (
    <div className="space-y-3" id="reveal-cta">
      {planPicker}
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
            disabled={!passwordOk || !agreed || p.busy}
            className="w-full min-h-[52px] px-4 rounded-xl bg-gradient-accent text-black text-base font-black flex items-center justify-center gap-2 shadow-glow-sm disabled:opacity-60"
          >
            {/* The card's own heading already says this creates the account;
                prefixing "Create account ·" made the label wrap or hit the
                edges on a phone, so the button just names the outcome. */}
            {p.busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up your program…</> : <>{offer.kind === 'none' ? 'Create account & start' : offer.button} <ChevronRight className="w-4 h-4 flex-shrink-0" /></>}
          </button>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              id="reveal-agree"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[var(--accent)] flex-shrink-0"
            />
            <span className="text-[11px] text-text-tertiary leading-relaxed">
              I am 18 or over, fit to exercise or have checked with a doctor, and I train within my own limits. I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent underline">Terms</a> and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent underline">Privacy Policy</a>.
            </span>
          </label>
        </div>
      )}
      {offer.line && <p className="wf-readout text-[10px] font-bold text-text-tertiary text-center">{offer.line}</p>}
      {/* The person who balks at the price used to just leave. Now they
          leave an email and get week one of a program for free, and the
          follow-up does the selling later. Only shown when the admin has the
          free plan switched on, since the page 404s otherwise. */}
      {freePlanOn && !p.busy && (
        <p className="text-center text-xs text-text-tertiary pt-1">
          Not ready yet? <Link href="/free-plan/pick" className="text-accent font-semibold hover:underline">Get week one free by email</Link>
        </p>
      )}
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
          ? <>{first ? `${first}, you're ` : "You're "}{/^[aeiou]/i.test(shortProgramName(p.match.name)) ? 'an' : 'a'} <span className="wf-lit">{shortProgramName(p.match.name)}</span> athlete.</>
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
              <p className="text-sm font-bold text-white flex items-center gap-2"><Lock className="w-4 h-4 text-accent" /> Why {money((cfg?.trialPriceCents ?? 100) / 100)}?</p>
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
