'use client';

/**
 * Watch data on the dashboard (phone apps only), drawn in the same card
 * style as the rest of the home screen: a readiness card shaped like the
 * streak tile (ring, state, one-line brief) and four small tiles shaped like
 * the calories and water tiles (icon label, big number over a goal or the
 * usual, a 7-day mini chart). Links to /body for the 30-day view.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ChevronRight, Moon, HeartPulse, Footprints, Flame, Watch } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { todaysEaseChoice, setEaseChoice } from '@/lib/recoveryEase';
import { readiness, brief, lastDays, series, mean, fmtMinutes, dayKey, type DayMap } from '@/lib/healthTrends';
import { Ring, Bars, Line, Meter } from './HudCharts';

export const STEP_GOAL = 10_000;

const C = {
  amber: '#F5A623',
  sleep: '#A5B4FC',
  heart: '#F87171',
  steps: '#4ADE80',
  kcal: '#FB923C',
  ok: '#4ADE80',
  alert: '#F87171',
};

export function levelColor(level: string) {
  return level === 'high' ? C.ok : level === 'low' ? C.alert : C.amber;
}

/** Today's program session, offered in a lighter version on a low day. */
export interface LighterOffer { href: string; before: number; after: number }

/**
 * The offer itself. Nothing changes unless the member taps "Use lighter
 * session"; "Keep as planned" hides it for the day. Once chosen, the
 * dashboard's Start button opens the lighter version too, and the member
 * can switch back to full here at any time.
 */
function LighterSession({ offer }: { offer: LighterOffer }) {
  const router = useRouter();
  const today = dayKey(new Date());
  const [choice, setChoice] = useState<'ease' | 'keep' | null | 'loading'>('loading');
  useEffect(() => { setChoice(todaysEaseChoice(today)); }, [today]);
  if (choice === 'loading' || choice === 'keep' || offer.after >= offer.before) return null;
  if (choice === 'ease') {
    return (
      <Card className="p-3.5 flex items-center justify-between gap-3 border-accent/40">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-accent uppercase tracking-wide">Lighter session on</span>
          <p className="text-sm text-white">{offer.before} sets → {offer.after} today</p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button onClick={() => { setEaseChoice(today, 'keep'); setChoice('keep'); }} className="px-3 py-2 rounded-xl bg-surface-elevated text-white text-xs font-bold">Back to full</button>
          <button onClick={() => router.push(`${offer.href}&ease=1`)} className="px-3 py-2 rounded-xl bg-accent text-black text-xs font-bold">Start</button>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-4 flex flex-col gap-3 border-accent/40">
      <div>
        <span className="text-[10px] font-bold text-accent uppercase tracking-wide">Suggested · recovery day</span>
        <p className="text-sm text-white leading-snug mt-1">
          Do today&apos;s session with fewer sets: <b className="tabular-nums">{offer.before} → {offer.after}</b>. Same exercises, reps and weights. Your program is not changed.
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { setEaseChoice(today, 'ease'); router.push(`${offer.href}&ease=1`); }} className="flex-1 py-2.5 rounded-xl bg-accent text-black text-sm font-bold active:scale-[.98] transition-transform">Use lighter session</button>
        <button onClick={() => { setEaseChoice(today, 'keep'); setChoice('keep'); }} className="flex-1 py-2.5 rounded-xl bg-surface-elevated text-white text-sm font-bold active:scale-[.98] transition-transform">Keep as planned</button>
      </div>
    </Card>
  );
}

function Tile({ icon, label, value, unit, chart, note, noteColor }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; chart: React.ReactNode; note: string; noteColor?: string;
}) {
  return (
    <Card className="p-3.5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className="text-lg font-black text-white tabular-nums truncate">
        {value}{unit && <span className="text-xs font-medium text-text-secondary ml-1">{unit}</span>}
      </p>
      <div>{chart}</div>
      <span className="text-[11px] font-medium truncate" style={{ color: noteColor }}>
        <span className={noteColor ? '' : 'text-text-tertiary'}>{note}</span>
      </span>
    </Card>
  );
}

const hhmm = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

export function WatchHud({ days, sourceName, busy, onSync, footer, lighter }: {
  days: DayMap; sourceName: string; busy: boolean; onSync: () => void; footer?: React.ReactNode; lighter?: LighterOffer | null;
}) {
  const week = lastDays(7);
  const prior14 = lastDays(15).slice(0, -1);
  const r = readiness(days);
  const today = days.get(week[6]);

  const sleep7 = series(days, week, 'sleepMinutes');
  const rhr7 = series(days, week, 'restingHeartRate');
  const avgHr7 = series(days, week, 'avgHeartRate');
  const min7 = series(days, week, 'minHeartRate');
  const hasRhr = rhr7.some((v) => v != null);
  const hasMin = !hasRhr && min7.some((v) => v != null);
  // Samsung and some other watches write total calories, not active ones.
  const kcalKey = series(days, week, 'activeKcal').some((v) => v != null) ? 'activeKcal' : 'totalKcal';
  const kcal7 = series(days, week, kcalKey);
  const sleepUsual = mean(series(days, prior14, 'sleepMinutes'), 4);
  const rhrUsual = mean(series(days, prior14, hasRhr ? 'restingHeartRate' : 'minHeartRate'), 4);
  const kcalUsual = mean(series(days, prior14, kcalKey), 4);

  const sleepLow = r.sleepDelta != null && r.sleepDelta <= -30;
  const rhrHigh = r.rhrDelta != null && r.rhrDelta >= 3;
  const hr = hasRhr ? today?.restingHeartRate : hasMin ? today?.minHeartRate : today?.avgHeartRate;
  const state = r.score == null ? 'Learning your normal' : r.level === 'high' ? 'Primed' : r.level === 'low' ? 'Take it easier' : 'Ready to train';

  return (
    <section className="flex flex-col gap-3" aria-label="Watch data">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Watch className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Readiness · {sourceName}</span>
          </div>
          <button onClick={onSync} disabled={busy} aria-label="Sync now" className="w-8 h-8 rounded-full bg-accent-muted text-accent flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform">
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <Ring value={r.score} color={levelColor(r.level)} size={88} />
          <div className="min-w-0 flex flex-col gap-1">
            <p className="text-base font-black" style={{ color: levelColor(r.level) }}>{state}</p>
            <p className="text-sm text-text-secondary leading-snug">{brief(r)}</p>
          </div>
        </div>
      </Card>

      {r.level === 'low' && lighter && <LighterSession offer={lighter} />}

      <div className="grid grid-cols-2 gap-3">
        <Tile
          icon={<Moon className="w-3.5 h-3.5" style={{ color: C.sleep }} />}
          label="Sleep"
          value={today?.sleepMinutes != null ? hhmm(today.sleepMinutes) : '0h 00m'}
          chart={<Bars values={sleep7} refValue={sleepUsual} alertLast={sleepLow} color={C.sleep} height={26} label="Sleep, last 7 nights" />}
          note={r.sleepDelta != null ? `${r.sleepDelta < 0 ? '−' : '+'}${fmtMinutes(r.sleepDelta)} vs usual` : 'Last 7 nights'}
          noteColor={sleepLow ? C.alert : undefined}
        />
        <Tile
          icon={<HeartPulse className="w-3.5 h-3.5" style={{ color: C.heart }} />}
          label={hasRhr ? 'Resting HR' : hasMin ? 'Lowest HR' : 'Heart rate'}
          value={hr != null ? String(hr) : '0'} unit="bpm"
          chart={hasRhr || hasMin
            ? <Line values={hasRhr ? rhr7 : min7} band={rhrUsual != null ? [rhrUsual - 2, rhrUsual + 2] : null} alertLast={rhrHigh} color={C.heart} height={26} label={hasRhr ? 'Resting heart rate, last 7 days' : 'Lowest heart rate, last 7 days'} />
            : <Line values={avgHr7} color={C.heart} height={26} label="Average heart rate, last 7 days" />}
          note={r.rhrDelta != null
            ? `${r.rhrDelta > 0 ? '+' : r.rhrDelta < 0 ? '−' : '±'}${Math.abs(r.rhrDelta)} bpm vs usual`
            : hr != null ? (hasRhr ? 'Resting, today' : hasMin ? 'Lowest today (usually asleep)' : 'Daily average') : 'No heart rate today'}
          noteColor={rhrHigh ? C.alert : undefined}
        />
        <Tile
          icon={<Footprints className="w-3.5 h-3.5" style={{ color: C.steps }} />}
          label="Steps"
          value={(today?.steps ?? 0).toLocaleString()} unit={`/${STEP_GOAL / 1000}k`}
          chart={<div className="pt-2 pb-1"><Meter value={today?.steps ?? 0} goal={STEP_GOAL} color={C.steps} /></div>}
          note={`${Math.round(((today?.steps ?? 0) / STEP_GOAL) * 100)}% of goal`}
          noteColor={(today?.steps ?? 0) >= STEP_GOAL ? C.ok : undefined}
        />
        <Tile
          icon={<Flame className="w-3.5 h-3.5" style={{ color: C.kcal }} />}
          label={kcalKey === 'activeKcal' ? 'Active kcal' : 'Calories burned'}
          value={String(today?.[kcalKey] ?? 0)}
          chart={<Bars values={kcal7} refValue={kcalUsual} color={C.kcal} height={26} label="Active calories, last 7 days" />}
          note="Last 7 days"
        />
      </div>

      {footer && <div className="flex flex-col gap-2 px-1">{footer}</div>}

      <Link href="/body" className="block active:scale-[.99] transition-transform">
        <Card className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">30-day trends, workouts and weight</span>
          <ChevronRight className="w-4 h-4 text-text-tertiary" />
        </Card>
      </Link>
      <p className="text-[11px] text-text-tertiary leading-snug px-1">Readiness is a guide from your sleep and resting heart rate compared with your own usual. It is not a medical measure.</p>
    </section>
  );
}
