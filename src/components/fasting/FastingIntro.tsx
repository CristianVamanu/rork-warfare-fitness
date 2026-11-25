'use client';

/**
 * First-time walkthrough for fasting: what it is, when you usually eat, the
 * plan that follows from that, and who should not fast. Shown once; the
 * answers are saved as the member's fasting settings.
 */
import { useState } from 'react';
import { ArrowLeft, X, UtensilsCrossed, HelpCircle, CalendarCheck, Salad, Dumbbell, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FASTING_PLANS, suggestPlan, type FastingPlan } from '@/lib/fasting';

export interface IntroResult { planId: string; startTime: string; firstMeal: string; lastMeal: string }

function Art({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className="flex-1 flex items-center justify-center py-6">
      <div className="relative w-44 h-44 rounded-full bg-accent/10 border border-accent/25 flex items-center justify-center">
        <div aria-hidden className="absolute inset-4 rounded-full border border-accent/15" />
        <Icon className="w-20 h-20 text-accent" strokeWidth={1.5} />
      </div>
    </div>
  );
}

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-3 text-[15px] text-text-secondary leading-relaxed"><span className="mt-2 w-2 h-2 rounded-full bg-accent flex-shrink-0" />{children}</li>
);

export function FastingIntro({ onDone, onClose }: { onDone: (r: IntroResult) => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [firstMeal, setFirstMeal] = useState('08:00');
  const [lastMeal, setLastMeal] = useState('21:00');
  const [plan, setPlan] = useState<FastingPlan | null>(null);
  const [startTime, setStartTime] = useState('');
  const TOTAL = 9;
  const chosen = plan ?? suggestPlan(firstMeal, lastMeal);
  const start = startTime || lastMeal;

  const next = () => setStep((s) => Math.min(TOTAL - 1, s + 1));
  const timeInput = 'w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-4 text-2xl font-black text-white text-center tabular-nums focus:outline-none focus:border-accent/50';

  const screens: { title: string; cta: string; body: React.ReactNode; onNext?: () => void }[] = [
    { title: 'Welcome to fasting', cta: 'Sounds good', body: <><p className="text-[15px] text-text-secondary leading-relaxed">A simple way to manage your weight by changing when you eat. Here is how it works.</p><Art icon={UtensilsCrossed} /></> },
    { title: 'How it works', cta: 'Next', body: <><p className="text-[15px] text-text-secondary leading-relaxed">You focus on when you eat, not on cutting foods out.</p><ul className="mt-4 space-y-3"><Bullet>Fasting window: no food. Most of it happens while you sleep.</Bullet><Bullet>Eating window: your normal meals, inside a set number of hours.</Bullet><Bullet>Water, black coffee and plain tea are fine while fasting.</Bullet></ul><Art icon={HelpCircle} /></> },
    { title: 'When do you usually eat?', cta: 'Set times', onNext: () => { setPlan(null); setStartTime(''); next(); }, body: (
      <div className="grid grid-cols-2 gap-3 mt-2">
        <label className="block"><span className="block text-xs text-text-secondary mb-2 text-center">First meal</span><input type="time" value={firstMeal} onChange={(e) => setFirstMeal(e.target.value || '08:00')} className={timeInput} /></label>
        <label className="block"><span className="block text-xs text-text-secondary mb-2 text-center">Last meal</span><input type="time" value={lastMeal} onChange={(e) => setLastMeal(e.target.value || '21:00')} className={timeInput} /></label>
      </div>) },
    { title: 'Build the habit', cta: 'Next', body: <><p className="text-[15px] text-text-secondary leading-relaxed">Start with a window you can actually keep. It gets easier within a week or two, and you can move to longer fasts later.</p><Art icon={CalendarCheck} /></> },
    { title: 'Your starting plan', cta: 'Next', body: (
      <div className="space-y-3 mt-2">
        <p className="text-[15px] text-text-secondary leading-relaxed">Based on your meal times, this is one step beyond what you already do overnight.</p>
        <div className="rounded-2xl border border-accent/40 bg-accent/[0.08] p-5">
          <p className="text-4xl font-black text-white">{chosen.id}</p>
          <div className="mt-3 pt-3 border-t border-white/10 flex justify-between text-sm">
            <span className="text-text-secondary"><b className="text-white">{chosen.fast} hours</b> fasting</span>
            <span className="text-text-secondary"><b className="text-white">{chosen.eat} {chosen.eat === 1 ? 'hour' : 'hours'}</b> eating</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FASTING_PLANS.map((pl) => (
            <button key={pl.id} type="button" onClick={() => setPlan(pl)} className={`px-3 py-1.5 rounded-full border text-xs font-bold ${pl.id === chosen.id ? 'border-accent bg-accent text-black' : 'border-white/15 text-text-secondary'}`}>{pl.id}</button>
          ))}
        </div>
        <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-surface p-4">
          <span className="text-sm font-bold text-white">Fasting starts</span>
          <input type="time" value={start} onChange={(e) => setStartTime(e.target.value)} className="bg-transparent text-white font-bold tabular-nums text-right focus:outline-none" />
        </label>
      </div>) },
    { title: 'What to eat before a fast', cta: 'Next', body: <><p className="text-[15px] text-text-secondary leading-relaxed">These keep you full for longer:</p><ul className="mt-4 space-y-3"><Bullet>Protein: chicken, eggs, fish, Greek yoghurt, beans.</Bullet><Bullet>Fibre: oats, vegetables, lentils, fruit, seeds.</Bullet><Bullet>Drink plenty of water through the fast.</Bullet></ul><Art icon={Salad} /></> },
    { title: 'Can I train while fasting?', cta: 'Next', body: <><p className="text-[15px] text-text-secondary leading-relaxed">Most people can. Easy and moderate sessions are usually fine fasted. Hard sessions tend to feel better close to, or inside, your eating window. If you feel dizzy or weak, stop and eat.</p><Art icon={Dumbbell} /></> },
    { title: 'Before you start', cta: 'Got it', body: (
      <div className="space-y-4">
        <div className="flex justify-center pt-2"><div className="w-20 h-20 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center"><ShieldAlert className="w-10 h-10 text-accent" strokeWidth={1.5} /></div></div>
        <p className="text-[15px] font-bold text-white text-center">Fasting is not recommended if you:</p>
        <ul className="space-y-2.5">
          <Bullet>have, or have had, an eating disorder</Bullet>
          <Bullet>have diabetes, especially type 1, or take medication that affects blood sugar</Bullet>
          <Bullet>are pregnant or breastfeeding</Bullet>
          <Bullet>are under 18</Bullet>
        </ul>
        <p className="text-xs text-text-tertiary leading-relaxed">Talk to a doctor before starting if any of these apply, or if you have a medical condition. Nothing here is medical advice.</p>
      </div>) },
    { title: 'You are ready', cta: "Let's get started", onNext: () => onDone({ planId: chosen.id, startTime: start, firstMeal, lastMeal }), body: <><p className="text-[15px] text-text-secondary leading-relaxed">Start your fast after your last meal of the day. The timer shows where you are and what is typically happening at each stage.</p><Art icon={CheckCircle2} /></> },
  ];
  const s = screens[step];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" role="dialog" aria-modal="true" aria-label="Fasting introduction">
      <div aria-hidden className="wf-field" />
      <div className="relative flex-1 flex flex-col max-w-lg w-full mx-auto px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
        <div className="flex gap-1.5 pt-2">
          {Array.from({ length: TOTAL }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-white/12'}`} />)}
        </div>
        <div className="flex items-center justify-between h-12 mt-1">
          {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} aria-label="Back" className="p-2 -ml-2 text-white"><ArrowLeft className="w-5 h-5" /></button> : <span />}
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-white"><X className="w-5 h-5" /></button>
        </div>
        <h1 className="text-3xl font-black text-white leading-tight mt-2 mb-4">{s.title}</h1>
        <div className="flex-1 flex flex-col">{s.body}</div>
        <div className="pt-5"><Button fullWidth size="lg" onClick={s.onNext ?? next}>{s.cta}</Button></div>
      </div>
    </div>
  );
}
