'use client';

/**
 * Steps, sleep and heart rate from the phone's health app.
 *
 * Only renders inside the native iOS/Android apps: in a browser there is no
 * HealthKit / Health Connect to read, so the card returns null and the
 * dashboard looks exactly as before. First visit shows a "Connect" prompt;
 * once granted it syncs the last 3 days on every dashboard mount and shows
 * today's numbers.
 */
import { useCallback, useEffect, useState } from 'react';
import { Watch } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import {
  isNativeApp, nativePlatform, lastHealthDiag, checkHealthAuth, requestHealthAuth, syncHealth, openHealthSettings,
  healthAvailability, openHealthConnectInstall,
  type HealthAuthState, type HealthDaySummary,
} from '@/lib/native/health';
import { useHealthHistory, syncWindow, markBackfilled } from '@/lib/useHealthHistory';
import { dayKey } from '@/lib/healthTrends';
import { HUD } from '@/components/hud/HudCharts';
import { WatchHud, type LighterOffer } from '@/components/hud/WatchHud';
import { getUserWorkouts } from '@/lib/firestore';
import type { AppSession } from '@/lib/trainingMinutes';


// Remembered for the app session: coming back to Home shows the last state
// and numbers straight away, and the phone is only re-read every few minutes.
let lastAuth: HealthAuthState | 'unknown' = 'unknown';
let lastToday: HealthDaySummary | null = null;
let lastSyncAt = 0;
const RESYNC_MS = 2 * 60_000;

export function HealthCard({ lighter }: { lighter?: LighterOffer | null } = {}) {
  const { user } = useAuth();
  const [native] = useState(() => isNativeApp());
  const [auth, setAuthState] = useState<HealthAuthState | 'unknown'>(lastAuth);
  const setAuth = (a: HealthAuthState | 'unknown') => { lastAuth = a; setAuthState(a); };
  const [liveToday, setTodayState] = useState<HealthDaySummary | null>(lastToday);
  const setToday = (t: HealthDaySummary | null) => { lastToday = t; setTodayState(t); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const { days, reload } = useHealthHistory(user?.uid);
  // Sessions finished in the app (last ~2 weeks), so training minutes count
  // app and watch together. Refreshed whenever the card comes back into view.
  const [appSessions, setAppSessions] = useState<AppSession[]>([]);
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    const load = () => getUserWorkouts(uid, 40)
      .then((rows) => setAppSessions(rows
        .map((r) => { const x = r as { completedAt?: { toDate?: () => Date } | null; duration?: unknown }; return { end: x.completedAt?.toDate?.() ?? null, minutes: Number(x.duration) || 0 }; })
        .filter((r): r is AppSession => r.end instanceof Date && r.minutes > 0)))
      .catch(() => {});
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user?.uid]);
  // Today from the live sync if it has run, else from the stored month.
  const storedToday = days.get(dayKey(new Date()));
  const today = liveToday ?? storedToday ?? null;
  const sourceName = nativePlatform() === 'ios' ? 'Apple Health' : 'Health Connect';

  const sync = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const n = syncWindow();
      const t = await syncHealth(user, n);
      if (n > 3) markBackfilled();
      if (t) setToday(t);
      lastSyncAt = Date.now();
      await reload();
    } catch (e) {
      setError((e as Error)?.message || 'Sync failed');
    } finally { setBusy(false); }
  }, [user, reload]);

  // Seed from the stored day so the card is filled on the first frame, then
  // refresh from the phone.
  useEffect(() => {
    if (!native || !user) return;
    let cancelled = false;
    (async () => {
      const avail = await healthAvailability();
      if (cancelled) return;
      if (!avail.available) { setReason(avail.reason || ''); setAuth('unavailable'); return; }
      const state = await checkHealthAuth();
      if (cancelled) return;
      setAuth(state);
      if (state === 'granted' || state === 'partial') {
        // Re-read the phone at most every 2 minutes; Sync now forces it.
        if (!cancelled && Date.now() - lastSyncAt > RESYNC_MS) await sync();
      }
    })();
    return () => { cancelled = true; };
  }, [native, user, sync]);

  // Keep it live without reopening the app: re-read the phone every 2
  // minutes while Home is on screen, and straight away when the app comes
  // back to the front (after checking the watch app, a call, etc.).
  useEffect(() => {
    if (!native || !user || (auth !== 'granted' && auth !== 'partial')) return;
    let running = false;
    const tick = async () => {
      if (running || document.visibilityState !== 'visible' || Date.now() - lastSyncAt < RESYNC_MS) return;
      running = true;
      try { await sync(); } finally { running = false; }
    };
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastSyncAt > 30_000) { lastSyncAt = 0; tick(); } };
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
  }, [native, user, auth, sync]);

  // Diagnostics while the native shells are being brought up: the UA marker
  // is set by the shell itself, so this shows inside the app even when the
  // injected bridge never ran (CSP, injection failure) and says which layer
  // is missing. Invisible in any browser.
  const uaNative = typeof navigator !== 'undefined' && navigator.userAgent.includes('WarfareFitnessNative');
  if (!native && uaNative) {
    const hasBridge = typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: unknown }).Capacitor;
    return (
      <Card className="p-3 text-[11px] text-text-secondary">
        <p className="font-bold text-white mb-1">Native shell diagnostics</p>
        <p>App UA marker: yes · Bridge object: {hasBridge ? 'yes' : 'no'} · Native platform: no</p>
        <p className="mt-1 text-text-tertiary break-all">{navigator.userAgent}</p>
      </Card>
    );
  }
  if (!native || auth === 'unknown') return null;

  // Health Connect missing or switched off (Android), or HealthKit absent
  // (iPad). Say so instead of hiding, so a blank dashboard is never a mystery.
  if (auth === 'unavailable') {
    const android = nativePlatform() === 'android';
    return (
      <Card className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-elevated flex items-center justify-center flex-shrink-0">
          <Watch className="w-5 h-5 text-text-tertiary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{sourceName} not available</p>
          <p className="text-xs text-text-secondary">
            {android ? 'Install or turn on Health Connect, then reopen the app.' : 'Health data is not available on this device.'}
            {reason && reason !== 'not-native' ? ` (${reason})` : ''}
          </p>
        </div>
        {android && (
          <button onClick={openHealthConnectInstall} className="px-3 py-2 rounded-lg bg-surface-elevated text-white text-xs font-bold active:scale-95 transition-transform">
            Get it
          </button>
        )}
      </Card>
    );
  }

  const connect = async () => {
    setBusy(true);
    const state = await requestHealthAuth();
    setAuth(state);
    setBusy(false);
    if (state === 'granted' || state === 'partial') await sync();
  };

  if (auth === 'denied') {
    return (
      <Card className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
          <Watch className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Connect {sourceName}</p>
          <p className="text-xs text-text-secondary">Steps, sleep and heart rate from your watch, on this dashboard.</p>
          {nativePlatform() === 'android' && (
            <p className="text-[10px] text-text-tertiary mt-1 leading-snug">Using Samsung Health? Turn on Samsung Health → Settings → Health Connect.</p>
          )}
        </div>
        <button
          onClick={connect}
          disabled={busy}
          className="px-3 py-2 rounded-lg bg-accent text-black text-xs font-bold disabled:opacity-50 active:scale-95 transition-transform"
        >
          {busy ? '…' : 'Connect'}
        </button>
      </Card>
    );
  }

  const empty = today?.steps == null && today?.sleepMinutes == null && (today?.restingHeartRate ?? today?.avgHeartRate) == null;
  return (
    <WatchHud
      days={days}
      sourceName={sourceName}
      busy={busy}
      onSync={sync}
      lighter={lighter ?? null}
      appSessions={appSessions}
      footer={(
        <>
          {(() => {
            // One plain card when there is nothing to show or a read failed.
            // The raw per-type diagnostics live in Settings → health check,
            // not on the dashboard.
            const noSource = (lastHealthDiag.sources ?? '').startsWith('none');
            const failed = Object.values(lastHealthDiag).some((v) => v.startsWith('error'));
            if (busy || (!empty && !noSource && !failed)) return null;
            const android = nativePlatform() === 'android';
            const text = failed && !empty
              ? 'Some of your data could not be read. Tap Allow access to check permissions.'
              : android
                ? 'Open Samsung Health (or your watch app) → Settings → Health Connect and turn on sharing. Your steps, sleep and workouts will appear here.'
                : 'Make sure your watch is syncing to the Health app. Your steps, sleep and workouts will appear here.';
            return (
              <div className="rounded-xl p-3 space-y-2.5" style={{ background: HUD.line }}>
                <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{failed && !empty ? 'Some data is missing' : 'No watch data yet'}</p>
                <p className="text-xs leading-snug" style={{ color: HUD.dim }}>{text}</p>
                <div className="flex gap-2">
                  <button onClick={connect} className="px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform" style={{ background: HUD.amber, color: HUD.ground }}>Allow access</button>
                  {android && (
                    <button onClick={openHealthSettings} className="px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--foreground)' }}>Open Health Connect</button>
                  )}
                </div>
              </div>
            );
          })()}
          {auth === 'partial' && !empty && (
            <button onClick={openHealthSettings} className="text-xs underline underline-offset-2 text-left" style={{ color: HUD.dim }}>
              Some data types are off. Manage permissions
            </button>
          )}
          {error && <p className="text-xs" style={{ color: HUD.alert }}>{error}</p>}
        </>
      )}
    />
  );
}
