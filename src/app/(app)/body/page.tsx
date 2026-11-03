'use client';

/**
 * "Body": the 30-day view of the watch data the app syncs (sleep, resting
 * heart rate, steps, active calories, weight) plus the workouts the watch
 * recorded. Data is read from the account, so it is the same on any device;
 * the panels need the phone app to have synced at least once.
 */
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useHealthHistory } from '@/lib/useHealthHistory';
import { lastDays, series, mean, fmtMinutes } from '@/lib/healthTrends';
import { kgToLbs } from '@/lib/utils';
import { HUD, HUD_DISPLAY, HUD_MONO, Bars, Line, HudLabel, useHudFonts } from '@/components/hud/HudCharts';
import { GetTheAppCard } from '@/components/dashboard/GetTheAppCard';

function Panel({ title, value, note, noteColor, children }: { title: string; value?: string; note?: string; noteColor?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: HUD.panel, border: `1px solid ${HUD.line}` }}>
      <div className="flex items-baseline justify-between gap-3">
        <HudLabel>{title}</HudLabel>
        {value && <span className="tabular-nums" style={{ fontFamily: HUD_DISPLAY, fontWeight: 700, fontSize: 22, color: HUD.fg }}>{value}</span>}
      </div>
      {children}
      {note && <span className="text-xs" style={{ fontFamily: HUD_MONO, color: noteColor ?? HUD.dim }}>{note}</span>}
    </section>
  );
}

const avgNote = (v: number | null, f: (n: number) => string) => (v == null ? 'Not enough data yet' : `30-day average ${f(v)}`);

export default function BodyPage() {
  const { user, profile } = useAuth();
  useHudFonts();
  const { days, loaded } = useHealthHistory(user?.uid, 30);
  const dates = lastDays(30);
  const lbs = profile?.weightUnit === 'lbs';

  const sleep = series(days, dates, 'sleepMinutes');
  const rhr = series(days, dates, 'restingHeartRate');
  const steps = series(days, dates, 'steps');
  const kcal = series(days, dates, 'activeKcal');
  const weight = series(days, dates, 'weightKg').map(v => (v == null ? null : lbs ? kgToLbs(v) : v));
  const wNums = weight.filter((v): v is number => v != null);
  const wDelta = wNums.length >= 2 ? Math.round((wNums[wNums.length - 1] - wNums[0]) * 10) / 10 : null;
  const unit = lbs ? 'lb' : 'kg';

  const workouts = dates.slice().reverse().flatMap(d => (days.get(d)?.workouts ?? []).map(w => ({ ...w, date: d }))).slice(0, 20);
  const hasAny = days.size > 0;

  return (
    <div className="min-h-screen" style={{ background: HUD.ground }}>
      <Header title="Body" showBack />
      <div className="px-4 py-4 max-w-lg md:max-w-2xl mx-auto flex flex-col gap-3">
        <HudLabel color={HUD.signal}>Last 30 days · from your watch</HudLabel>

        {loaded && !hasAny && (
          <section className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: HUD.panel, border: `1px solid ${HUD.line}` }}>
            <p className="text-sm font-semibold" style={{ color: HUD.fg }}>No watch data on your account yet</p>
            <p className="text-sm" style={{ color: HUD.dim }}>Open the Warfare Fitness app on your phone and connect Health Connect or Apple Health from the dashboard. Your trends then show here on every device.</p>
            <GetTheAppCard />
            <Link href="/dashboard" className="text-sm underline underline-offset-2" style={{ color: HUD.amber }}>Back to dashboard</Link>
          </section>
        )}

        {hasAny && (
          <>
            <Panel title="Sleep" value={sleep[29] != null ? fmtMinutes(sleep[29]!) : undefined} note={avgNote(mean(sleep, 3), fmtMinutes)}>
              <Bars values={sleep} refValue={mean(sleep, 3)} height={72} label="Sleep, last 30 nights" />
            </Panel>
            <Panel title="Resting heart rate" value={rhr[29] != null ? `${rhr[29]} bpm` : undefined} note={avgNote(mean(rhr, 3), n => `${Math.round(n)} bpm`)}>
              <Line values={rhr} height={72} fill label="Resting heart rate, last 30 days" />
            </Panel>
            <Panel title="Steps" value={steps[29] != null ? steps[29]!.toLocaleString() : undefined} note={avgNote(mean(steps, 3), n => Math.round(n).toLocaleString())}>
              <Bars values={steps} refValue={10_000} height={60} label="Steps, last 30 days, dashed line at 10,000" />
            </Panel>
            <Panel title="Active calories" value={kcal[29] != null ? `${kcal[29]} kcal` : undefined} note={avgNote(mean(kcal, 3), n => `${Math.round(n)} kcal`)}>
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
                  {workouts.map((w, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: i ? `1px solid ${HUD.line}` : undefined }}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate capitalize" style={{ color: HUD.fg }}>{w.type.replace(/_/g, ' ').toLowerCase()}</p>
                        <p className="text-xs truncate" style={{ color: HUD.faint }}>{new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{w.source ? ` · ${w.source}` : ''}</p>
                      </div>
                      <span className="text-xs tabular-nums flex-shrink-0" style={{ fontFamily: HUD_MONO, color: HUD.dim }}>{w.minutes} min{w.kcal ? ` · ${w.kcal} kcal` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
