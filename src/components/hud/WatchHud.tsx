'use client';

/**
 * The app's watch panel on the dashboard: readiness ring with a one-line
 * brief, then four metric tiles, each with a 7-day chart and a delta against
 * the person's own usual. Links to /body for the 30-day view.
 */
import Link from 'next/link';
import { RefreshCw, ChevronRight } from 'lucide-react';
import { readiness, brief, lastDays, series, mean, fmtMinutes, type DayMap } from '@/lib/healthTrends';
import { HUD, HUD_DISPLAY, HUD_MONO, Ring, Bars, Line, Meter, HudLabel } from './HudCharts';

export const STEP_GOAL = 10_000;

export function levelColor(level: string) {
  return level === 'high' ? HUD.ok : level === 'low' ? HUD.alert : HUD.amber;
}

function Tile({ label, value, unit, chart, note, noteColor }: {
  label: string; value: string; unit?: string; chart: React.ReactNode; note: string; noteColor?: string;
}) {
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-1.5 min-w-0" style={{ background: HUD.panel, border: `1px solid ${HUD.line}` }}>
      <HudLabel>{label}</HudLabel>
      <p className="leading-none tabular-nums truncate" style={{ fontFamily: HUD_DISPLAY, fontWeight: 700, fontSize: 28, color: HUD.fg }}>
        {value}{unit && <span className="ml-1" style={{ fontSize: 13, color: HUD.dim, fontFamily: HUD_MONO, fontWeight: 400 }}>{unit}</span>}
      </p>
      <div className="mt-0.5">{chart}</div>
      <span className="text-[11px] tracking-wide truncate" style={{ fontFamily: HUD_MONO, color: noteColor ?? HUD.dim }}>{note}</span>
    </div>
  );
}

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;

export function WatchHud({ days, sourceName, busy, onSync, footer }: {
  days: DayMap; sourceName: string; busy: boolean; onSync: () => void; footer?: React.ReactNode;
}) {
  const week = lastDays(7);
  const prior14 = lastDays(15).slice(0, -1);
  const r = readiness(days);
  const today = days.get(week[6]);

  const sleep7 = series(days, week, 'sleepMinutes');
  const rhr7 = series(days, week, 'restingHeartRate');
  const steps7 = series(days, week, 'steps');
  const kcal7 = series(days, week, 'activeKcal');
  const sleepUsual = mean(series(days, prior14, 'sleepMinutes'), 4);
  const rhrUsual = mean(series(days, prior14, 'restingHeartRate'), 4);
  const kcalUsual = mean(series(days, prior14, 'activeKcal'), 4);

  const sleepLow = r.sleepDelta != null && r.sleepDelta <= -30;
  const rhrHigh = r.rhrDelta != null && r.rhrDelta >= 3;
  const hr = today?.restingHeartRate ?? today?.avgHeartRate;

  return (
    <section className="rounded-3xl p-3.5 flex flex-col gap-3" style={{ background: HUD.ground, border: `1px solid ${HUD.line}` }} aria-label="Watch data">
      <div className="flex items-center justify-between">
        <HudLabel color={HUD.signal}>Readiness · {sourceName}</HudLabel>
        <button onClick={onSync} disabled={busy} aria-label="Sync now" className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform" style={{ background: HUD.panel, border: `1px solid ${HUD.line}`, color: HUD.signal }}>
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-2xl p-3.5 flex items-center gap-3.5" style={{ background: HUD.panel, border: `1px solid ${HUD.line}` }}>
        <Ring value={r.score} color={levelColor(r.level)} />
        <div className="min-w-0 flex flex-col gap-1">
          <HudLabel color={levelColor(r.level)}>{r.score == null ? 'Building baseline' : r.level === 'high' ? 'Primed' : r.level === 'low' ? 'Recover' : 'Ready'}</HudLabel>
          <p className="text-[13px] leading-snug" style={{ color: HUD.fg }}>{brief(r)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          label="Sleep"
          value={today?.sleepMinutes != null ? hhmm(today.sleepMinutes) : '--'}
          chart={<Bars values={sleep7} refValue={sleepUsual} alertLast={sleepLow} label="Sleep, last 7 nights" />}
          note={r.sleepDelta != null ? `${r.sleepDelta < 0 ? '−' : '+'}${fmtMinutes(r.sleepDelta)} vs usual` : '7 nights'}
          noteColor={sleepLow ? HUD.alert : undefined}
        />
        <Tile
          label={today?.restingHeartRate != null ? 'Resting HR' : 'Heart rate'}
          value={hr != null ? String(hr) : '--'} unit="bpm"
          chart={<Line values={rhr7} band={rhrUsual != null ? [rhrUsual - 2, rhrUsual + 2] : null} alertLast={rhrHigh} label="Resting heart rate, last 7 days" />}
          note={r.rhrDelta != null ? `${r.rhrDelta > 0 ? '+' : r.rhrDelta < 0 ? '−' : '±'}${Math.abs(r.rhrDelta)} bpm vs usual` : '7 days'}
          noteColor={rhrHigh ? HUD.alert : undefined}
        />
        <Tile
          label="Steps"
          value={today?.steps != null ? (today.steps >= 10_000 ? `${(today.steps / 1000).toFixed(1)}k` : today.steps.toLocaleString()) : '--'}
          chart={<div className="pt-2.5 pb-1"><Meter value={today?.steps ?? null} goal={STEP_GOAL} /></div>}
          note={today?.steps != null ? `${Math.round((today.steps / STEP_GOAL) * 100)}% of 10k` : `Goal 10k`}
          noteColor={today?.steps != null && today.steps >= STEP_GOAL ? HUD.ok : undefined}
        />
        <Tile
          label="Active kcal"
          value={today?.activeKcal != null ? String(today.activeKcal) : '--'}
          chart={<Bars values={kcal7} refValue={kcalUsual} label="Active calories, last 7 days" height={22} />}
          note={steps7.some(v => v != null) || kcal7.some(v => v != null) ? '7-day trend' : 'No data yet'}
        />
      </div>

      {footer}

      <Link href="/body" className="flex items-center justify-between rounded-2xl px-3.5 py-3 active:scale-[.99] transition-transform" style={{ background: HUD.panel, border: `1px solid ${HUD.line}` }}>
        <span className="text-sm font-semibold" style={{ color: HUD.fg }}>30-day trends, workouts and weight</span>
        <ChevronRight className="w-4 h-4" style={{ color: HUD.dim }} />
      </Link>
      <p className="text-[11px] leading-snug" style={{ color: HUD.faint }}>Readiness is a guide from your sleep and resting heart rate compared with your own usual. It is not a medical measure.</p>
    </section>
  );
}
