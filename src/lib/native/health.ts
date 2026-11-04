/**
 * Wearable data through the native shells.
 *
 * In the iOS and Android apps the site runs inside Capacitor, which exposes
 * Apple HealthKit and Google Health Connect through @capgo/capacitor-health.
 * In a browser (PWA, desktop) none of this exists: `isNativeApp()` is false,
 * every function below is a no-op, and the dashboard shows nothing about it.
 *
 * The phone is the source of truth. We read a few days back, build one plain
 * summary per local day and post it to /api/health/sync, which stores it
 * under healthDays/{uid}_{date}. Nothing raw leaves the device: per-sample
 * heart rate and sleep stages stay in the health app.
 */
import { Capacitor } from '@capacitor/core';
import { getIdToken } from 'firebase/auth';
import type { User } from 'firebase/auth';

export const HEALTH_READ_TYPES = ['steps', 'sleep', 'heartRate', 'restingHeartRate', 'weight', 'calories', 'workouts'] as const;

export interface HealthDaySummary {
  /** Local date, YYYY-MM-DD. */
  date: string;
  steps?: number;
  /** Minutes asleep (asleep + light + deep + rem; excludes awake and in-bed only). */
  sleepMinutes?: number;
  /** Average heart rate across the day's samples, bpm. */
  avgHeartRate?: number;
  restingHeartRate?: number;
  /** Latest body-weight reading of the day, kg. */
  weightKg?: number;
  /** Active energy burned, kcal. */
  activeKcal?: number;
  /** Workouts recorded by any app or watch that day. */
  workouts?: { type: string; minutes: number; kcal?: number; source?: string }[];
  /** Where the data came from, for the "Synced from Apple Health" line. */
  source: 'healthkit' | 'healthconnect';
}

export function isNativeApp(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  try { return Capacitor.getPlatform() as 'ios' | 'android' | 'web'; } catch { return 'web'; }
}

const localDate = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const startOfLocalDay = (d: Date) => { const s = new Date(d); s.setHours(0, 0, 0, 0); return s; };

// The plugin object is a Capacitor proxy: any property access, including the
// `.then` probe JavaScript performs when a promise resolves to an object,
// becomes a native call. Resolving to the proxy itself therefore threw
// '"Health.then()" is not implemented on android'. Always hand it back
// wrapped in a plain object.
type HealthPlugin = typeof import('@capgo/capacitor-health').Health;
let cached: { H: HealthPlugin } | null = null;
async function load(): Promise<{ H: HealthPlugin }> {
  if (!cached) { const mod = await import('@capgo/capacitor-health'); cached = { H: mod.Health }; }
  return cached;
}

export async function isHealthAvailable(): Promise<boolean> {
  return (await healthAvailability()).available;
}

/** Availability plus the platform's reason when it is not, for the card to show. */
export async function healthAvailability(): Promise<{ available: boolean; reason?: string }> {
  if (!isNativeApp()) return { available: false, reason: 'not-native' };
  try { const r = await (await load()).H.isAvailable(); return { available: !!r.available, reason: r.reason }; }
  catch (e) { return { available: false, reason: (e as Error)?.message || 'plugin-error' }; }
}

/** Android: opens the Play Store page for Health Connect (built in on Android 14+, an app before). */
export function openHealthConnectInstall(): void {
  window.open('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata', '_blank');
}

export type HealthAuthState = 'unavailable' | 'granted' | 'partial' | 'denied';

/**
 * What the last read got back from the phone, per data type: a sample
 * count or the error message. Shown behind "Details" on the dashboard card
 * so a "connected but empty" report can be diagnosed from a screenshot.
 */
export const lastHealthDiag: Record<string, string> = {};
/** The permission check's own answer, for the same Details view. */
export const lastHealthAuth: { allowed?: string; denied?: string } = {};

export async function checkHealthAuth(): Promise<HealthAuthState> {
  if (!(await isHealthAvailable())) return 'unavailable';
  try {
    const s = await (await load()).H.checkAuthorization({ read: [...HEALTH_READ_TYPES] });
    lastHealthAuth.allowed = s.readAuthorized.join(', ') || 'none';
    lastHealthAuth.denied = s.readDenied.join(', ') || 'none';
    if (s.readAuthorized.length === 0) return 'denied';
    return s.readDenied.length === 0 ? 'granted' : 'partial';
  } catch { return 'denied'; }
}

/** Opens the system permission sheet. Resolves to the state afterwards. */
export async function requestHealthAuth(): Promise<HealthAuthState> {
  if (!(await isHealthAvailable())) return 'unavailable';
  try {
    const s = await (await load()).H.requestAuthorization({ read: [...HEALTH_READ_TYPES], requestHistoryAccess: true });
    if (s.readAuthorized.length === 0) return 'denied';
    return s.readDenied.length === 0 ? 'granted' : 'partial';
  } catch { return 'denied'; }
}

export async function openHealthSettings(): Promise<void> {
  if (nativePlatform() !== 'android') return;
  try { await (await load()).H.openHealthConnectSettings(); } catch { /* noop */ }
}

/**
 * Builds one summary per local day for the last `days` days (today included).
 * Each data type is read on its own and a failure in one (not granted, not
 * recorded on this phone) leaves that field undefined instead of failing the
 * whole sync.
 */
export async function readHealthDays(days = 3): Promise<HealthDaySummary[]> {
  for (const k of Object.keys(lastHealthDiag)) delete lastHealthDiag[k];
  lastHealthDiag.sleep = '0 records';
  lastHealthDiag.workouts = '0 records';
  const note = (k: string) => ({
    ok: (n: number) => { lastHealthDiag[k] = `${n} ${n === 1 ? 'record' : 'records'}`; },
    fail: (e: unknown) => { lastHealthDiag[k] = `error: ${(e as Error)?.message || String(e)}`.slice(0, 160); },
  });
  const { H: Health } = await load();
  const source: HealthDaySummary['source'] = nativePlatform() === 'ios' ? 'healthkit' : 'healthconnect';
  const now = new Date();
  const from = startOfLocalDay(new Date(now.getTime() - (days - 1) * 86400_000));
  const byDate = new Map<string, HealthDaySummary>();
  for (let i = 0; i < days; i++) {
    const d = localDate(new Date(from.getTime() + i * 86400_000));
    byDate.set(d, { date: d, source });
  }
  const day = (iso: string) => byDate.get(localDate(new Date(iso)));
  const range = { startDate: from.toISOString(), endDate: now.toISOString() };

  async function sumByDay(
    dataType: 'steps' | 'calories',
    key: 'steps' | 'activeKcal',
    round: (n: number) => number,
    n: { ok: (c: number) => void; fail: (e: unknown) => void },
  ) {
    let aggErr: unknown = null;
    try {
      const r = await Health.queryAggregated({ dataType, ...range, bucket: 'day', aggregation: 'sum' });
      let got = 0;
      r.samples.forEach(s => { const x = day(s.startDate); if (x && s.value > 0) { x[key] = round(s.value); got++; } });
      if (got > 0) { n.ok(got); return; }
    } catch (e) { aggErr = e; }
    try {
      const r = await Health.readSamples({ dataType, ...range, limit: 5000, ascending: true });
      const sums = new Map<HealthDaySummary, number>();
      r.samples.forEach(s => { const x = day(s.startDate); if (x && s.value > 0) sums.set(x, (sums.get(x) ?? 0) + s.value); });
      sums.forEach((v, x) => { x[key] = round(v); });
      n.ok(r.samples.length);
      if (aggErr) lastHealthDiag[dataType] += ' (aggregate failed, used samples)';
    } catch (e) { n.fail(aggErr ?? e); }
  }

  // Steps and active calories: daily sums straight from the platform, which
  // already de-duplicates overlapping sources (phone + watch).
  await Promise.all([
    // Daily sums from the platform (de-duplicates phone + watch). If the
    // aggregate query fails or comes back empty, fall back to summing the
    // raw samples per day, so one broken query path can't blank the card.
    sumByDay('steps', 'steps', Math.round, note('steps')),
    // Which apps actually write into Health Connect / Apple Health (Samsung
    // Health, Google Fit, a watch app...). "Connected but empty" is almost
    // always no app feeding it, and this names them, or says none.
    Health.readSamples({ dataType: 'steps', startDate: new Date(now.getTime() - 3 * 86400_000).toISOString(), endDate: now.toISOString(), limit: 300, ascending: false })
      .then(r => {
        const names = Array.from(new Set(r.samples.map(s => (s as { sourceName?: string }).sourceName).filter(Boolean)));
        lastHealthDiag.sources = names.length ? names.join(', ') : 'none: no app is writing steps into it';
      })
      .catch(e => { lastHealthDiag.sources = `error: ${(e as Error)?.message || String(e)}`.slice(0, 160); }),
    sumByDay('calories', 'activeKcal', Math.round, note('calories')),
    Health.queryAggregated({ dataType: 'heartRate', ...range, bucket: 'day', aggregation: 'average' })
      .then(r => { note('heartRate').ok(r.samples.length); r.samples.forEach(s => { const x = day(s.startDate); if (x && s.value > 0) x.avgHeartRate = Math.round(s.value); }); })
      .catch(note('heartRate').fail),
    Health.readSamples({ dataType: 'restingHeartRate', ...range, limit: 200, ascending: true })
      .then(r => { note('restingHeartRate').ok(r.samples.length); r.samples.forEach(s => { const x = day(s.startDate); if (x && s.value > 0) x.restingHeartRate = Math.round(s.value); }); })
      .catch(note('restingHeartRate').fail),
    Health.readSamples({ dataType: 'weight', ...range, limit: 200, ascending: true })
      .then(r => { note('weight').ok(r.samples.length); r.samples.forEach(s => { const x = day(s.startDate); if (x && s.value > 0) x.weightKg = Math.round(s.value * 10) / 10; }); })
      .catch(note('weight').fail),
    // Sleep: a night is credited to the day you wake up, so a session is
    // filed under its END date. Only time actually asleep counts.
    Health.readSamples({ dataType: 'sleep', startDate: new Date(from.getTime() - 12 * 3600_000).toISOString(), endDate: now.toISOString(), limit: 200, ascending: true })
      .then(r => r.samples.forEach((s, i, all) => {
        if (i === 0) note('sleep').ok(all.length);
        const x = day(s.endDate); if (!x) return;
        const asleepStates = new Set(['asleep', 'light', 'deep', 'rem']);
        let mins = 0;
        if (s.stages && s.stages.length) mins = s.stages.filter(st => asleepStates.has(st.stage)).reduce((a, st) => a + st.durationMinutes, 0);
        else if (!s.sleepState || asleepStates.has(s.sleepState)) mins = s.value;
        if (mins > 0) x.sleepMinutes = (x.sleepMinutes ?? 0) + Math.round(mins);
      }))
      .catch(note('sleep').fail),
    Health.queryWorkouts({ ...range, limit: 50, ascending: true })
      .then(r => r.workouts.forEach((w, i, all) => {
        if (i === 0) note('workouts').ok(all.length);
        const x = day(w.startDate); if (!x) return;
        (x.workouts ??= []).push({ type: w.workoutType, minutes: Math.round(w.duration / 60), ...(w.totalEnergyBurned ? { kcal: Math.round(w.totalEnergyBurned) } : {}), ...(w.sourceName ? { source: w.sourceName } : {}) });
      }))
      .catch(note('workouts').fail),
  ]);
  return [...byDate.values()];
}

/** Reads the phone's health data and stores the summaries. Returns today's. */
export async function syncHealth(user: User, days = 3): Promise<HealthDaySummary | null> {
  if (!isNativeApp()) return null;
  // A native call that never answers (Health Connect mid-update, a provider
  // crash) must not leave the card spinning forever.
  const summaries = await Promise.race([
    readHealthDays(days),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Health data timed out. Try again.')), 25_000)),
  ]);
  const token = await getIdToken(user);
  const res = await fetch('/api/health/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ days: summaries }),
  });
  if (!res.ok) throw new Error(`Health sync failed (${res.status})`);
  return summaries.find(s => s.date === localDate(new Date())) ?? null;
}

export const formatSleep = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
