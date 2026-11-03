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
  isNativeApp, nativePlatform, lastHealthDiag, lastHealthAuth, checkHealthAuth, requestHealthAuth, syncHealth, openHealthSettings,
  healthAvailability, openHealthConnectInstall,
  type HealthAuthState, type HealthDaySummary,
} from '@/lib/native/health';
import { useHealthHistory, syncWindow, markBackfilled } from '@/lib/useHealthHistory';
import { dayKey } from '@/lib/healthTrends';
import { HUD } from '@/components/hud/HudCharts';
import { WatchHud, type LighterOffer } from '@/components/hud/WatchHud';


export function HealthCard({ lighter }: { lighter?: LighterOffer | null } = {}) {
  const { user } = useAuth();
  const [native] = useState(() => isNativeApp());
  const [auth, setAuth] = useState<HealthAuthState | 'unknown'>('unknown');
  const [liveToday, setToday] = useState<HealthDaySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const { days, reload } = useHealthHistory(user?.uid);
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
        if (!cancelled) await sync();
      }
    })();
    return () => { cancelled = true; };
  }, [native, user, sync]);

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
      footer={(
        <>
          {empty && !busy && (
            // Granted on paper, nothing came back: permissions were never actually
            // shown (a fresh install can report a type as readable before the
            // sheet has been seen), or the health app isn't syncing to Health
            // Connect yet. Give both fixes a button instead of a row of dashes.
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs" style={{ color: HUD.dim }}>
                Nothing from {sourceName} today yet.{nativePlatform() === 'android' ? ' Check Samsung Health → Settings → Health Connect is syncing.' : ''}
              </p>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={connect} className="px-2.5 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform" style={{ background: HUD.amber, color: HUD.ground }}>Allow access</button>
                {nativePlatform() === 'android' && (
                  <button onClick={openHealthSettings} className="px-2.5 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform" style={{ background: HUD.line, color: HUD.fg }}>Open</button>
                )}
              </div>
            </div>
          )}
          {auth === 'partial' && (
            <button onClick={openHealthSettings} className="text-xs underline underline-offset-2 text-left" style={{ color: HUD.dim }}>
              Some data types are off. Manage permissions
            </button>
          )}
          {error && <p className="text-xs" style={{ color: HUD.alert }}>{error}</p>}
          <details className="text-[11px]" style={{ color: HUD.dim }}>
            <summary className="cursor-pointer select-none">Details</summary>
            <div className="mt-1.5 space-y-0.5 font-mono break-words">
              <p>Allowed: {lastHealthAuth.allowed ?? '?'}</p>
              <p>Not allowed: {lastHealthAuth.denied ?? '?'}</p>
              {Object.entries(lastHealthDiag).map(([k, v]) => <p key={k}>{k}: {v}</p>)}
              {Object.keys(lastHealthDiag).length === 0 && <p>No read has run yet. Tap sync.</p>}
            </div>
          </details>
        </>
      )}
    />
  );
}
