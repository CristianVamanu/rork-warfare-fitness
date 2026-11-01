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
import { Footprints, Moon, HeartPulse, RefreshCw, Watch } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import {
  isNativeApp, nativePlatform, checkHealthAuth, requestHealthAuth, syncHealth, openHealthSettings, formatSleep,
  healthAvailability, openHealthConnectInstall,
  type HealthAuthState, type HealthDaySummary,
} from '@/lib/native/health';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function HealthCard() {
  const { user } = useAuth();
  const [native] = useState(() => isNativeApp());
  const [auth, setAuth] = useState<HealthAuthState | 'unknown'>('unknown');
  const [today, setToday] = useState<HealthDaySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const sourceName = nativePlatform() === 'ios' ? 'Apple Health' : 'Health Connect';

  const sync = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const t = await syncHealth(user, 3);
      if (t) setToday(t);
    } catch (e) {
      setError((e as Error)?.message || 'Sync failed');
    } finally { setBusy(false); }
  }, [user]);

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
        try {
          const snap = await getDoc(doc(db, 'healthDays', `${user.uid}_${todayKey()}`));
          if (!cancelled && snap.exists()) setToday(snap.data() as HealthDaySummary);
        } catch { /* fine, the live sync follows */ }
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

  const steps = today?.steps, sleep = today?.sleepMinutes, hr = today?.restingHeartRate ?? today?.avgHeartRate;
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Watch className="w-3.5 h-3.5 text-accent" />
          <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">{sourceName} · today</span>
        </div>
        <button onClick={sync} disabled={busy} aria-label="Sync now" className="w-7 h-7 rounded-full bg-accent-muted text-accent flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Footprints className="w-3.5 h-3.5 text-green-400" />} label="Steps" value={steps != null ? steps.toLocaleString() : '—'} />
        <Stat icon={<Moon className="w-3.5 h-3.5 text-indigo-300" />} label="Sleep" value={sleep != null ? formatSleep(sleep) : '—'} />
        <Stat icon={<HeartPulse className="w-3.5 h-3.5 text-red-400" />} label={today?.restingHeartRate != null ? 'Resting HR' : 'Heart rate'} value={hr != null ? `${hr} bpm` : '—'} />
      </div>
      {steps == null && sleep == null && hr == null && !busy && (
        // Granted on paper, nothing came back: permissions were never actually
        // shown (a fresh install can report a type as readable before the
        // sheet has been seen), or the health app isn't syncing to Health
        // Connect yet. Give both fixes a button instead of a row of dashes.
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-text-tertiary">
            Nothing from {sourceName} yet.{nativePlatform() === 'android' ? ' Check Samsung Health → Settings → Health Connect is syncing.' : ''}
          </p>
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={connect} className="px-2.5 py-1.5 rounded-lg bg-accent text-black text-[11px] font-bold active:scale-95 transition-transform">Allow access</button>
            {nativePlatform() === 'android' && (
              <button onClick={openHealthSettings} className="px-2.5 py-1.5 rounded-lg bg-surface-elevated text-white text-[11px] font-bold active:scale-95 transition-transform">Open</button>
            )}
          </div>
        </div>
      )}
      {auth === 'partial' && (
        <button onClick={openHealthSettings} className="mt-2.5 text-[11px] text-text-tertiary underline underline-offset-2">
          Some data types are off. Manage permissions
        </button>
      )}
      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-elevated px-2.5 py-2">
      <div className="flex items-center gap-1 mb-1">{icon}<span className="text-[10px] font-semibold text-text-tertiary">{label}</span></div>
      <p className="text-sm font-black text-white truncate">{value}</p>
    </div>
  );
}
