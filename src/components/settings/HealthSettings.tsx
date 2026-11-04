'use client';

/**
 * Settings → Watch & health data (phone apps only).
 *
 * Everything about the Health Connect / Apple Health link in one place:
 * status, connect, sync now, disconnect, and a check that reads the last 7
 * days straight from the phone and shows, per data type, how many records
 * came back (or the error) and which apps are writing them. That check is
 * what tells "the app is broken" apart from "no app is feeding Health
 * Connect", which is the usual reason for an empty dashboard.
 */
import { useEffect, useState } from 'react';
import { Watch, RefreshCw, Link2, Unlink, Stethoscope } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  isNativeApp, nativePlatform, healthAvailability, checkHealthAuth, requestHealthAuth, syncHealth,
  openHealthSettings, openHealthConnectInstall, readHealthDays, lastHealthDiag, lastHealthAuth,
  type HealthAuthState, type HealthDaySummary,
} from '@/lib/native/health';

const LABELS: Record<string, string> = {
  steps: 'Steps', calories: 'Active calories', heartRate: 'Heart rate', restingHeartRate: 'Resting heart rate',
  weight: 'Weight', sleep: 'Sleep', workouts: 'Workouts',
};

export function HealthSettings() {
  const { user } = useAuth();
  const [native] = useState(() => isNativeApp());
  const [state, setState] = useState<HealthAuthState | 'unknown'>('unknown');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'' | 'connect' | 'sync' | 'check'>('');
  const [check, setCheck] = useState<{ diag: Record<string, string>; days: HealthDaySummary[]; allowed?: string; denied?: string } | null>(null);
  const source = nativePlatform() === 'ios' ? 'Apple Health' : 'Health Connect';
  const android = nativePlatform() === 'android';

  const refresh = async () => {
    const a = await healthAvailability();
    if (!a.available) { setReason(a.reason || ''); setState('unavailable'); return; }
    setState(await checkHealthAuth());
  };
  useEffect(() => { if (native) refresh(); }, [native]);

  if (!native) {
    return (
      <Card className="flex items-center gap-3 px-4 py-3.5">
        <Watch className="w-5 h-5 text-text-tertiary flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Watch &amp; health data</p>
          <p className="text-xs text-text-secondary">Connect your watch in the Warfare Fitness phone app. Browsers cannot read Health Connect or Apple Health.</p>
        </div>
      </Card>
    );
  }

  const connect = async () => {
    setBusy('connect');
    try { setState(await requestHealthAuth()); } finally { setBusy(''); }
  };
  const sync = async () => {
    if (!user) return;
    setBusy('sync');
    try {
      const t = await syncHealth(user, 30);
      toast.success(t && (t.steps || t.sleepMinutes || t.restingHeartRate || t.avgHeartRate) ? 'Synced. Your dashboard is up to date.' : 'Synced, but nothing came back for today. Run the check below.');
    } catch (e) { toast.error((e as Error).message || 'Sync failed'); }
    finally { setBusy(''); }
  };
  const runCheck = async () => {
    setBusy('check');
    try {
      await checkHealthAuth();
      const days = await readHealthDays(7);
      setCheck({ diag: { ...lastHealthDiag }, days, allowed: lastHealthAuth.allowed, denied: lastHealthAuth.denied });
    } catch (e) {
      setCheck({ diag: { error: (e as Error).message || String(e) }, days: [] });
    } finally { setBusy(''); }
  };

  const connected = state === 'granted' || state === 'partial';
  const status = state === 'unknown' ? 'Checking…'
    : state === 'unavailable' ? `${source} is not available${reason && reason !== 'not-native' ? ` (${reason})` : ''}`
    : state === 'granted' ? 'Connected' : state === 'partial' ? 'Connected, some data types off' : 'Not connected';

  const daysWithData = check?.days.filter((d) => d.steps || d.sleepMinutes || d.avgHeartRate || d.restingHeartRate || d.activeKcal || d.weightKg).length ?? 0;
  const noFeeder = (check?.diag.sources ?? '').startsWith('none');

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0"><Watch className="w-5 h-5 text-accent" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{source}</p>
          <p className={`text-xs ${connected ? 'text-success' : 'text-text-secondary'}`}>{status}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {state === 'unavailable' && android ? (
          <Button size="sm" onClick={openHealthConnectInstall}><Link2 className="w-3.5 h-3.5" /> Get Health Connect</Button>
        ) : (
          <Button size="sm" onClick={connect} disabled={!!busy || state === 'unavailable'}><Link2 className="w-3.5 h-3.5" /> {connected ? 'Allow more data' : 'Connect'}</Button>
        )}
        <Button size="sm" variant="secondary" onClick={sync} disabled={!!busy || !connected}><RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} /> Sync now</Button>
        <Button size="sm" variant="secondary" onClick={runCheck} disabled={!!busy || state === 'unavailable'}><Stethoscope className="w-3.5 h-3.5" /> {busy === 'check' ? 'Checking…' : 'Run health check'}</Button>
        <Button size="sm" variant="secondary" onClick={() => { openHealthSettings(); toast(`Turn off Warfare Fitness in ${source} to disconnect.`); }} disabled={state === 'unavailable'}><Unlink className="w-3.5 h-3.5" /> Disconnect</Button>
      </div>
      <p className="text-[11px] text-text-tertiary leading-snug">
        {android
          ? 'Your watch app (Samsung Health, Google Fit, Garmin, Fitbit…) must share its data with Health Connect, and Health Connect must allow Warfare Fitness to read it. Both switches live in Health Connect.'
          : 'Your watch syncs to the Health app, and the Health app must allow Warfare Fitness to read it.'}
      </p>

      {check && (
        <div className="rounded-xl p-3 space-y-2 text-xs" style={{ backgroundColor: 'var(--card-glass-bg)', border: '1px solid var(--card-glass-border)' }}>
          <p className={`font-bold ${daysWithData ? 'text-success' : 'text-danger'}`}>
            {daysWithData ? `Working: data on ${daysWithData} of the last 7 days.` : noFeeder ? `No app is sending data to ${source}.` : `Nothing came back from ${source} for the last 7 days.`}
          </p>
          {!daysWithData && (
            <p className="text-text-secondary leading-snug">
              {android
                ? 'Open Health Connect → App permissions → your watch app (e.g. Samsung Health) and allow it to WRITE steps, sleep and heart rate. On Samsung: Samsung Health → Settings → Health Connect. Then come back and tap Sync now.'
                : 'Open the Health app → your profile → Apps → Warfare Fitness and turn the data types on.'}
            </p>
          )}
          <div className="font-mono text-[11px] text-text-secondary space-y-0.5 break-words">
            <p>Apps feeding it: {check.diag.sources ?? '?'}</p>
            <p>Allowed: {check.allowed ?? '?'}</p>
            <p>Not allowed: {check.denied ?? '?'}</p>
            {Object.entries(check.diag).filter(([k]) => k !== 'sources').map(([k, v]) => <p key={k}>{LABELS[k] ?? k}: {v}</p>)}
          </div>
          {android && <button onClick={openHealthSettings} className="font-bold text-accent underline underline-offset-2">Open Health Connect</button>}
        </div>
      )}
    </Card>
  );
}
