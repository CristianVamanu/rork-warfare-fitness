'use client';

/**
 * Fasting: a ring timer with the stages of the fast around it, start and
 * goal times, a card for the current stage, and the week's history.
 * First visit runs a short walkthrough (components/fasting/FastingIntro).
 */
import { useEffect, useMemo, useState } from 'react';
import { doc, updateDoc, deleteField, Timestamp } from 'firebase/firestore';
import { Utensils, Droplet, Flame, Zap, Sparkles, Pencil, Info, ChevronLeft, ChevronRight, Hourglass, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PaywallGate } from '@/components/ui/PaywallGate';
import { FastingIntro, type IntroResult } from '@/components/fasting/FastingIntro';
import {
  FASTING_PLANS, FASTING_STAGES, planById, stageAt, addToLog, weekBars, weekStart, formatHMS, formatHM, toHHMM, toMinutes,
  type FastLogEntry,
} from '@/lib/fasting';

const STAGE_ICON: Record<string, React.ElementType> = { fed: Utensils, settle: Droplet, burn: Flame, ketosis: Zap, repair: Sparkles };
interface Prefs { planId?: string; startTime?: string; introDone?: boolean }

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
function dayWord(ms: number, now: number) {
  const d = new Date(ms), n = new Date(now);
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) / 86_400_000);
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** A 270° ring with a marker where each stage typically begins. */
function Ring({ pct, goalHours, hours, active, children }: { pct: number; goalHours: number; hours: number; active: boolean; children: React.ReactNode }) {
  const R = 118, C = 150, SWEEP = 270, START = 135; // degrees, clockwise from 3 o'clock
  const pt = (deg: number, r = R) => ({ x: C + r * Math.cos((deg * Math.PI) / 180), y: C + r * Math.sin((deg * Math.PI) / 180) });
  const arc = (frac: number) => { const a = pt(START), b = pt(START + SWEEP * frac); return `M${a.x} ${a.y} A${R} ${R} 0 ${SWEEP * frac > 180 ? 1 : 0} 1 ${b.x} ${b.y}`; };
  const marks = FASTING_STAGES.filter((s) => s.from < goalHours);
  return (
    <div className="relative mx-auto w-full max-w-[320px] aspect-square">
      <svg viewBox="0 0 300 300" className="w-full h-full" aria-hidden>
        <path d={arc(1)} fill="none" stroke="rgba(128,128,128,0.18)" strokeWidth="12" strokeLinecap="round" />
        {pct > 0 && <path d={arc(Math.min(1, pct))} fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 8px rgb(var(--accent-rgb) / 0.6))' }} />}
      </svg>
      {marks.map((s) => {
        const p = pt(START + SWEEP * (s.from / goalHours));
        const Icon = STAGE_ICON[s.id];
        const reached = active && hours >= s.from;
        const current = active && stageAt(hours).id === s.id;
        return (
          <span key={s.id} title={s.title}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full border flex items-center justify-center transition-colors ${current ? 'bg-accent border-accent text-black shadow-glow-sm' : reached ? 'bg-surface border-accent/60 text-accent' : 'bg-surface border-white/12 text-text-tertiary'}`}
            style={{ left: `${(p.x / 300) * 100}%`, top: `${(p.y / 300) * 100}%` }}>
            <Icon className="w-5 h-5" />
          </span>
        );
      })}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-10">{children}</div>
    </div>
  );
}

export default function FastingPage() {
  const { user, profile } = useAuth();
  const p = profile as unknown as { fasting?: { startedAt?: unknown; goalHours: number } | null; fastingPrefs?: Prefs; fastingLog?: FastLogEntry[] } | null;
  const prefs = p?.fastingPrefs ?? {};
  const plan = planById(prefs.planId);
  const fasting = p?.fasting ?? null;
  const startMs = fasting ? ((fasting.startedAt as Timestamp | undefined)?.toMillis?.() ?? Date.now()) : 0;

  const [now, setNow] = useState(Date.now());
  const [intro, setIntro] = useState(false);
  const [planModal, setPlanModal] = useState(false);
  const [timeModal, setTimeModal] = useState(false);
  const [stopModal, setStopModal] = useState(false);
  const [infoModal, setInfoModal] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [week, setWeek] = useState(0);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  // First visit: the walkthrough. Not for someone already mid-fast from Home.
  const hasProfile = !!profile;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the profile first arrives
  useEffect(() => { if (hasProfile && !prefs.introDone && !fasting) setIntro(true); }, [hasProfile]);

  const goalHours = fasting?.goalHours ?? plan.fast;
  const elapsed = fasting ? Math.max(0, now - startMs) : 0;
  const hours = elapsed / 3_600_000;
  const goalMs = startMs + goalHours * 3_600_000;
  const reached = !!fasting && now >= goalMs;
  const stage = stageAt(hours);
  const StageIcon = STAGE_ICON[stage.id];

  // Plain writes: they land in the on-device cache at once and sync later, so
  // a weak signal never leaves a button spinning.
  const save = (data: Record<string, unknown>, failed: string) => {
    if (!user) return;
    updateDoc(doc(db, 'users', user.uid), data as Record<string, never>).catch(() => { if (failed) toast.error(failed); });
  };

  function finishIntro(r: IntroResult) {
    setIntro(false);
    save({ fastingPrefs: { planId: r.planId, startTime: r.startTime, firstMeal: r.firstMeal, lastMeal: r.lastMeal, introDone: true } }, 'Could not save your plan.');
  }
  function start() {
    save({ fasting: { startedAt: Timestamp.now(), goalHours: plan.fast } }, 'Could not start the fast. Check your connection.');
    toast.success(`Fast started. Goal ${plan.fast} hours.`);
  }
  function stop() {
    setStopModal(false);
    if (!fasting) return;
    const log = addToLog(p?.fastingLog, { start: startMs, end: Date.now(), goalHours });
    save({ fasting: deleteField(), fastingLog: log }, 'Could not save the fast. Check your connection.');
    toast.success(reached ? `Goal reached: ${formatHM(hours)} fasted` : `Fast ended at ${formatHM(hours)}`);
  }
  function pickPlan(id: string) {
    setPlanModal(false);
    const next = planById(id);
    save({ fastingPrefs: { ...prefs, planId: id, introDone: true }, ...(fasting ? { fasting: { startedAt: Timestamp.fromMillis(startMs), goalHours: next.fast } } : {}) }, 'Could not change the plan.');
  }
  function openTime() {
    if (fasting) { const d = new Date(startMs); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); setEditValue(d.toISOString().slice(0, 16)); }
    else setEditValue(prefs.startTime || '18:00');
    setTimeModal(true);
  }
  function saveTime() {
    setTimeModal(false);
    if (fasting) {
      const t = new Date(editValue).getTime();
      if (!Number.isFinite(t) || t > Date.now()) { toast.error('The start has to be in the past.'); return; }
      save({ fasting: { startedAt: Timestamp.fromMillis(t), goalHours } }, 'Could not change the start time.');
    } else if (/^\d\d:\d\d$/.test(editValue)) {
      save({ fastingPrefs: { ...prefs, startTime: editValue, introDone: true } }, 'Could not save the time.');
    }
  }

  const ws = useMemo(() => weekStart(new Date(), week), [week]);
  const bars = weekBars(p?.fastingLog, ws);
  const weekEnd = new Date(ws.getTime() + 6 * 86_400_000);
  const fmtDay = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  const maxBar = Math.max(goalHours, ...bars.hours, 1);
  const plannedStart = prefs.startTime || '18:00';

  return (
    <PaywallGate feature="fasting" noTaste>
      <Header title="Fasting" showBack rightElement={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPlanModal(true)} className="h-9 px-3 rounded-full border border-white/15 text-sm font-bold text-white flex items-center gap-1.5">{plan.id} <Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => setInfoModal(true)} aria-label="About fasting" className="w-9 h-9 rounded-full border border-white/15 text-white flex items-center justify-center"><Info className="w-4 h-4" /></button>
        </div>} />
      <div className="px-4 pb-28 max-w-lg mx-auto space-y-4">
        <div className="pf-card relative overflow-hidden rounded-3xl border border-white/10 bg-surface p-5">
          <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
          <div className="relative">
            <Ring pct={fasting ? hours / goalHours : 0} goalHours={goalHours} hours={hours} active={!!fasting}>
              {fasting ? (
                <>
                  <p className="text-sm text-text-secondary">{reached ? 'Goal reached' : 'You are fasting'}</p>
                  <p className="text-[40px] font-black text-white tabular-nums leading-none mt-1">{formatHMS(elapsed)}</p>
                  <p className="text-xs text-accent font-semibold mt-2">{reached ? `+${formatHM(hours - goalHours)} past goal` : `${formatHM(Math.max(0, goalHours - hours))} to go`}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-text-secondary">Upcoming fast</p>
                  <p className="text-[40px] font-black text-white leading-none mt-1">{plan.fast} hours</p>
                  <p className="text-xs text-text-tertiary mt-2">{plan.eat}-hour eating window</p>
                </>
              )}
            </Ring>

            <div className="flex items-center gap-3 border-y border-white/8 py-3 mt-1">
              <button type="button" onClick={openTime} aria-label="Change start time" className="w-11 h-11 rounded-full bg-black/20 border border-white/10 flex items-center justify-center text-white flex-shrink-0"><Pencil className="w-4 h-4" /></button>
              <div className="flex-1">
                <p className="text-lg font-black text-white tabular-nums leading-tight">{fasting ? clock(startMs) : plannedStart}</p>
                <p className="text-xs text-text-secondary">Start{fasting ? `, ${dayWord(startMs, now)}` : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-white tabular-nums leading-tight">{fasting ? clock(goalMs) : toHHMM(toMinutes(plannedStart) + plan.fast * 60)}</p>
                <p className="text-xs text-text-secondary">Goal{fasting ? `, ${dayWord(goalMs, now)}` : ''}</p>
              </div>
            </div>

            <div className="mt-4">
              {fasting
                ? <Button fullWidth size="lg" variant={reached ? 'primary' : 'secondary'} onClick={() => setStopModal(true)}>{reached ? 'End fast' : 'Stop fasting'}</Button>
                : <Button fullWidth size="lg" onClick={start}>Start fasting</Button>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-accent/12 border border-accent/30 text-accent flex items-center justify-center flex-shrink-0">
              {fasting ? <StageIcon className="w-5 h-5" /> : <Hourglass className="w-5 h-5" />}
            </span>
            <p className="text-base font-black text-white">{fasting ? stage.title : 'Prepare for your fast'}</p>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed mt-3">
            {fasting ? stage.body : 'Have a meal with protein and fibre before you start, and keep water nearby. Black coffee and plain tea are fine during the fast.'}
          </p>
          {fasting && (() => { const nx = FASTING_STAGES.find((s) => s.from > hours && s.from < Math.max(goalHours, hours + 0.01)); return nx ? <p className="text-xs text-text-tertiary mt-2">Next: {nx.title.toLowerCase()} at about {nx.from} hours.</p> : null; })()}
        </div>

        <div>
          <div className="flex items-end justify-between mb-2">
            <h2 className="text-lg font-black text-white">Weekly stats</h2>
            <span className="text-xs text-text-secondary">{(p?.fastingLog ?? []).length} fasts logged</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-surface p-4">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setWeek(week - 1)} aria-label="Previous week" className="w-10 h-10 rounded-full bg-black/20 border border-white/10 text-white flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
              <div className="text-center">
                <p className="text-sm font-bold text-white">{week === 0 ? 'This week' : `${fmtDay(ws)} – ${fmtDay(weekEnd)}`}</p>
                <p className="text-xs text-text-secondary">Average {formatHM(bars.average)}</p>
              </div>
              <button type="button" onClick={() => setWeek(Math.min(0, week + 1))} disabled={week === 0} aria-label="Next week" className="w-10 h-10 rounded-full bg-black/20 border border-white/10 text-white flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="flex items-end gap-2 h-32 mt-4">
              {bars.hours.map((h, i) => (
                <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
                  {h > 0 && <span className="text-[10px] font-bold text-white tabular-nums">{Math.round(h)}h</span>}
                  <div className="w-full max-w-[22px] rounded-full bg-white/8 flex-1 flex items-end overflow-hidden">
                    <div className={`w-full rounded-full ${h >= goalHours ? 'bg-accent' : 'bg-accent/50'}`} style={{ height: `${(h / maxBar) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-text-tertiary">{'MTWTFSS'[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {(p?.fastingLog ?? []).length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-surface divide-y divide-white/8">
            {(p?.fastingLog ?? []).slice(0, 8).map((e) => {
              const h = (e.end - e.start) / 3_600_000;
              return (
                <div key={e.start} className="flex items-center gap-3 px-4 py-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${h >= e.goalHours ? 'bg-accent text-black' : 'bg-white/8 text-text-tertiary'}`}><Check className="w-4 h-4" /></span>
                  <div className="flex-1"><p className="text-sm font-bold text-white">{formatHM(h)}</p><p className="text-xs text-text-secondary">{new Date(e.end).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · goal {e.goalHours}h</p></div>
                  {h >= e.goalHours && <span className="text-[10px] font-bold text-accent uppercase tracking-wide">Goal met</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {intro && <FastingIntro onDone={finishIntro} onClose={() => { setIntro(false); save({ fastingPrefs: { ...prefs, introDone: true } }, ''); }} />}

      <Modal open={planModal} onClose={() => setPlanModal(false)} title="Fasting plan">
        <div className="space-y-2">
          {FASTING_PLANS.map((pl) => (
            <button key={pl.id} type="button" onClick={() => pickPlan(pl.id)} className={`w-full text-left rounded-2xl border p-4 flex items-center justify-between ${pl.id === plan.id ? 'border-accent bg-accent/[0.08]' : 'border-white/10 bg-surface'}`}>
              <span><span className="block text-lg font-black text-white">{pl.id}</span><span className="block text-xs text-text-secondary">{pl.fast}h fasting · {pl.eat}h eating</span></span>
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">{pl.note}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={timeModal} onClose={() => setTimeModal(false)} title={fasting ? 'When did you start?' : 'Usual start time'}>
        <div className="space-y-4">
          <input type={fasting ? 'datetime-local' : 'time'} value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-4 text-xl font-black text-white text-center focus:outline-none focus:border-accent/50" />
          <Button fullWidth onClick={saveTime}>Save</Button>
        </div>
      </Modal>

      <Modal open={stopModal} onClose={() => setStopModal(false)} title={reached ? 'End your fast?' : 'Stop fasting early?'}>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{reached ? `You fasted ${formatHM(hours)}. It will be saved to your history.` : `You have fasted ${formatHM(hours)} of ${goalHours} hours. Stopping now still counts in your history.`}</p>
          <Button fullWidth onClick={stop}>{reached ? 'End fast' : 'Stop and save'}</Button>
          <Button fullWidth variant="ghost" onClick={() => setStopModal(false)}>Keep going</Button>
        </div>
      </Modal>

      <Modal open={infoModal} onClose={() => setInfoModal(false)} title="About fasting">
        <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
          <p>The stages around the timer show what typically happens as a fast goes on. Timings differ from person to person.</p>
          <p className="text-white font-bold">Fasting is not recommended if you have or have had an eating disorder, have diabetes or take medication that affects blood sugar, are pregnant or breastfeeding, or are under 18.</p>
          <p>Talk to a doctor first if you have a medical condition. If you feel faint or unwell, stop and eat. Nothing here is medical advice.</p>
          <Button fullWidth variant="secondary" onClick={() => { setInfoModal(false); setIntro(true); }}>Replay the introduction</Button>
        </div>
      </Modal>
    </PaywallGate>
  );
}
