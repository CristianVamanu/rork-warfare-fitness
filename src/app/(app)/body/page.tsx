'use client';

/**
 * "Body": the 30-day view of the watch data the app syncs (sleep, resting
 * heart rate, steps, active calories, weight) plus the workouts the watch
 * recorded. Data is read from the account, so it is the same on any device;
 * the panels need the phone app to have synced at least once.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useHealthHistory } from '@/lib/useHealthHistory';
import { lastDays, series, mean, fmtMinutes } from '@/lib/healthTrends';
import { kgToLbs } from '@/lib/utils';
import { HUD, HUD_DISPLAY, HUD_MONO, Bars, Line, HudLabel } from '@/components/hud/HudCharts';
import { Card } from '@/components/ui/Card';
import { GetTheAppCard } from '@/components/dashboard/GetTheAppCard';

function Panel({ title, value, note, noteColor, children }: { title: string; value?: string; note?: string; noteColor?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <HudLabel>{title}</HudLabel>
        {value && <span className="tabular-nums" style={{ fontFamily: HUD_DISPLAY, fontWeight: 700, fontSize: 22, color: 'var(--foreground)' }}>{value}</span>}
      </div>
      {children}
      {note && <span className="text-xs" style={{ color: noteColor ?? HUD.dim }}>{note}</span>}
    </Card>
  );
}

const avgNote = (v: number | null, f: (n: number) => string) => (v == null ? 'Not enough data yet' : `30-day average ${f(v)}`);

// Package ids mean nothing to a member; show the app's name where we know it.
const SOURCES: Record<string, string> = {
  'com.sec.android.app.shealth': 'Samsung Health', 'com.google.android.apps.fitness': 'Google Fit', 'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect', 'com.strava': 'Strava', 'com.google.android.apps.healthdata': 'Health Connect',
  'com.whoop.android': 'WHOOP', 'com.ouraring.oura': 'Oura', 'com.polar.polarflow': 'Polar Flow',
};
const sourceLabel = (s: string) => SOURCES[s] ?? (s.includes('.') ? s.split('.').pop()! : s);

export default function BodyPage() {
  const { user, profile } = useAuth();
  const [workoutLimit, setWorkoutLimit] = useState(10);
  const { days, loaded } = useHealthHistory(user?.uid, 30);
  const dates = lastDays(30);
  const lbs = profile?.weightUnit === 'lbs';

  const sleep = series(days, dates, 'sleepMinutes');
  const rhrReal = series(days, dates, 'restingHeartRate');
  const rhrIsLowest = !rhrReal.some((v) => v != null);
  const rhr = rhrIsLowest ? series(days, dates, 'minHeartRate') : rhrReal;
  const steps = series(days, dates, 'steps');
  const kcalActive = series(days, dates, 'activeKcal');
  const kcalIsTotal = !kcalActive.some((v) => v != null);
  const kcal = kcalIsTotal ? series(days, dates, 'totalKcal') : kcalActive;
  const weight = series(days, dates, 'weightKg').map(v => (v == null ? null : lbs ? kgToLbs(v) : v));
  const wNums = weight.filter((v): v is number => v != null);
  const wDelta = wNums.length >= 2 ? Math.round((wNums[wNums.length - 1] - wNums[0]) * 10) / 10 : null;
  const unit = lbs ? 'lb' : 'kg';

  const hrv = series(days, dates, 'hrvMs');
  const avgHr = series(days, dates, 'avgHeartRate');
  const stageNights = dates.filter((d) => (days.get(d)?.deepMinutes ?? 0) + (days.get(d)?.remMinutes ?? 0) + (days.get(d)?.lightMinutes ?? 0) > 0);
  const maxStage = Math.max(1, ...stageNights.map((d) => { const n = days.get(d)!; return (n.deepMinutes ?? 0) + (n.remMinutes ?? 0) + (n.lightMinutes ?? 0); }));
  const avgStage = (k: 'deepMinutes' | 'remMinutes' | 'lightMinutes') => Math.round(stageNights.reduce((a, d) => a + (days.get(d)?.[k] ?? 0), 0) / Math.max(1, stageNights.length));
  const workouts = dates.slice().reverse().flatMap(d => (days.get(d)?.workouts ?? []).map(w => ({ ...w, date: d })));
  // Ten at a time, never more than 30: the window is 30 days and a daily
  // walker would otherwise scroll for pages.
  const shownWorkouts = workouts.slice(0, Math.min(workoutLimit, 30));
  const canShowMore = shownWorkouts.length < Math.min(workouts.length, 30);
  const hasAny = days.size > 0;

  return (
    <div className="min-h-screen">
      <Header title="Trends" showBack />
      <div className="px-4 py-4 max-w-lg md:max-w-2xl mx-auto flex flex-col gap-3">
        <HudLabel color={HUD.signal}>Last 30 days · from your watch</HudLabel>

        {loaded && !hasAny && (
          <Card className="p-4 flex flex-col gap-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>No watch data on your account yet</p>
            <p className="text-sm" style={{ color: HUD.dim }}>Connect your watch from the dashboard in the Warfare Fitness app. Your sleep, steps, calories, weight and workouts will show here as 30-day trends.</p>
            <GetTheAppCard />
            <Link href="/dashboard" className="text-sm underline underline-offset-2" style={{ color: HUD.amber }}>Back to dashboard</Link>
          </Card>
        )}

        {hasAny && (
          <>
            <Panel title="Sleep" value={sleep[29] != null ? fmtMinutes(sleep[29]!) : undefined} note={avgNote(mean(sleep, 3), fmtMinutes)}>
              <Bars values={sleep} refValue={mean(sleep, 3)} height={72} label="Sleep, last 30 nights" />
            </Panel>
            {stageNights.length > 0 && (
              <Panel title="Sleep stages" note={`Average: deep ${fmtMinutes(avgStage('deepMinutes'))} · REM ${fmtMinutes(avgStage('remMinutes'))} · light ${fmtMinutes(avgStage('lightMinutes'))}`}>
                <div className="flex items-end gap-[3px] h-[72px]" role="img" aria-label="Sleep stages per night, last 30 nights">
                  {dates.map((d) => {
                    const n = days.get(d);
                    const deep = n?.deepMinutes ?? 0, rem = n?.remMinutes ?? 0, light = n?.lightMinutes ?? 0, total = deep + rem + light;
                    const h = (v: number) => `${(v / maxStage) * 100}%`;
                    return (
                      <div key={d} className="flex-1 h-full flex flex-col justify-end rounded-sm overflow-hidden" title={total ? `${d}: deep ${deep}m, REM ${rem}m, light ${light}m` : d}>
                        {total ? (<>
                          <div style={{ height: h(light), background: '#C7D2FE' }} />
                          <div style={{ height: h(rem), background: '#818CF8' }} />
                          <div style={{ height: h(deep), background: '#4338CA' }} />
                        </>) : <div style={{ height: 2, background: 'var(--progress-track)' }} />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-3 text-[11px] text-text-tertiary">
                  <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#4338CA' }} />Deep</span>
                  <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#818CF8' }} />REM</span>
                  <span><i className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#C7D2FE' }} />Light</span>
                </div>
              </Panel>
            )}
            {/* Heart data only where the platform shares it (Apple Health). The
                Android app does not request heart rate, so these stay hidden. */}
            {avgHr.some((v) => v != null) && (
              <Panel title="Average heart rate" value={avgHr[29] != null ? `${avgHr[29]} bpm` : undefined} note={avgNote(mean(avgHr, 3), n => `${Math.round(n)} bpm · daily average from your watch`)}>
                <Line values={avgHr} height={64} fill label="Average heart rate, last 30 days" />
              </Panel>
            )}
            {/* HRV only when there is some (iPhone / Apple Watch); Android does not request it. */}
            {hrv.some((v) => v != null) && (
              <Panel title="Heart rate variability" value={hrv[29] != null ? `${hrv[29]} ms` : undefined} note={avgNote(mean(hrv, 3), n => `${Math.round(n)} ms · higher is usually better recovered`)}>
                <Line values={hrv} height={64} fill label="Heart rate variability, last 30 days" />
              </Panel>
            )}
            {rhr.some((v) => v != null) && (
              <Panel title={rhrIsLowest ? 'Lowest heart rate' : 'Resting heart rate'} value={rhr[29] != null ? `${rhr[29]} bpm` : undefined} note={avgNote(mean(rhr, 3), n => `${Math.round(n)} bpm`)}>
              <Line values={rhr} height={72} fill label="Resting heart rate, last 30 days" />
            </Panel>
            )}
            <Panel title="Steps" value={steps[29] != null ? steps[29]!.toLocaleString() : undefined} note={avgNote(mean(steps, 3), n => Math.round(n).toLocaleString())}>
              <Bars values={steps} refValue={10_000} height={60} label="Steps, last 30 days, dashed line at 10,000" />
            </Panel>
            <Panel title={kcalIsTotal ? 'Calories burned (total)' : 'Active calories'} value={kcal[29] != null ? `${kcal[29]} kcal` : undefined} note={avgNote(mean(kcal, 3), n => `${Math.round(n)} kcal`)}>
              <Bars values={kcal} refValue={mean(kcal, 3)} height={60} label="Active calories, last 30 days" />
            </Panel>
            <Panel
              title="Weight"
              value={wNums.length ? `${wNums[wNums.length - 1]} ${unit}` : undefined}
              note={wDelta == null ? 'Weigh in with a smart scale or log it in Health Connect' : `${wDelta > 0 ? '+' : wDelta < 0 ? '−' : '±'}${Math.abs(wDelta)} ${unit} over the period`}
            >
              <Line values={weight} height={56} label="Weight, last 30 days" />
            </Panel>
            <Panel title="Watch workouts">
              {workouts.length === 0 ? (
                <p className="text-sm" style={{ color: HUD.dim }}>No workouts recorded by your watch in the last 30 days.</p>
              ) : (
                <ul className="flex flex-col">
                  {shownWorkouts.map((w, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: i ? `1px solid ${HUD.line}` : undefined }}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate capitalize" style={{ color: 'var(--foreground)' }}>{w.type.replace(/_/g, ' ').toLowerCase()}</p>
                        <p className="text-xs truncate" style={{ color: HUD.faint }}>{new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{w.source ? ` · ${sourceLabel(w.source)}` : ''}</p>
                      </div>
                      <span className="text-xs tabular-nums flex-shrink-0" style={{ fontFamily: HUD_MONO, color: HUD.dim }}>{w.minutes} min{w.kcal ? ` · ${w.kcal} kcal` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canShowMore && (
                <button type="button" onClick={() => setWorkoutLimit((n) => n + 10)} className="mt-2 w-full rounded-xl py-2.5 text-xs font-bold" style={{ border: `1px solid ${HUD.line}`, color: 'var(--foreground)' }}>
                  Load more
                </button>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
