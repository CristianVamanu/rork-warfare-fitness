'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { loadPackages, buyPackage, restore, type StorePackage } from '@/lib/native/purchases';

/** Google Play subscriptions (RevenueCat), shown only inside the app when configured. */
export function PlayPaywall({ uid }: { uid: string }) {
  const [pkgs, setPkgs] = useState<StorePackage[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setFailed(null); setPkgs(null);
    loadPackages(uid).then((p) => { if (!alive) return; setPkgs(p); setPick(p.find((x) => x.period === 'year')?.id ?? p[0]?.id ?? null); })
      .catch((e: unknown) => {
        if (!alive) return;
        const err = e as { code?: string | number; message?: string };
        console.error('[paywall] Google Play plans failed to load', e);
        setFailed(String(err?.code ?? err?.message ?? 'unknown').slice(0, 80));
      });
    return () => { alive = false; };
  }, [uid, attempt]);
  // Never a blank space: if Google Play returns nothing, say so, offer a
  // retry, and show the reason code so support can tell what went wrong.
  if (failed || (pkgs && pkgs.length === 0)) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface p-4 text-center space-y-2">
        <p className="text-sm font-bold text-white">Plans couldn&apos;t load from Google Play</p>
        <p className="text-xs text-text-secondary">Check you&apos;re signed in to the Play Store and installed the app from Google Play, then try again.</p>
        <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        <p className="text-[10px] text-text-tertiary">Code: {failed ?? 'no-plans'}</p>
      </div>
    );
  }
  if (!pkgs) return <Loader2 className="w-5 h-5 animate-spin text-accent mx-auto" />;
  const chosen = pkgs.find((p) => p.id === pick) ?? null;
  const go = async () => {
    if (!chosen) return;
    setBusy('buy'); setMsg(null);
    try { if (await buyPackage(uid, chosen)) setMsg('Purchase complete. Unlocking your membership…'); }
    catch { setMsg('The purchase did not go through. You have not been charged.'); }
    finally { setBusy(null); }
  };
  const back = async () => {
    setBusy('restore'); setMsg(null);
    try { setMsg((await restore(uid)) ? 'Purchases restored. Unlocking your membership…' : 'No active Google Play subscription found for this account.'); }
    catch { setMsg('Could not reach Google Play. Try again in a moment.'); }
    finally { setBusy(null); }
  };
  return (
    <div className="space-y-3 text-left">
      {pkgs.map((p) => (
        <button key={p.id} type="button" onClick={() => setPick(p.id)} aria-pressed={pick === p.id}
          className={`w-full rounded-2xl border px-4 py-3 flex items-center justify-between ${pick === p.id ? 'border-accent bg-accent/10' : 'border-white/10 bg-surface'}`}>
          <span className="font-bold text-white">{p.period === 'year' ? 'Yearly' : p.period === 'month' ? 'Monthly' : p.title}</span>
          <span className="flex items-center gap-2 text-white font-black">{p.price}{p.period ? <span className="text-xs text-text-tertiary font-semibold">/ {p.period}</span> : null}{pick === p.id && <Check className="w-4 h-4 text-accent" />}</span>
        </button>
      ))}
      <Button fullWidth onClick={go} disabled={!chosen || !!busy}>{busy === 'buy' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Subscribe with Google Play'}</Button>
      <button type="button" onClick={back} disabled={!!busy} className="w-full text-xs font-semibold text-accent py-1">{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</button>
      {msg && <p className="text-sm text-text-secondary text-center" role="status">{msg}</p>}
      <p className="text-[11px] text-text-tertiary leading-relaxed text-center">
        Renews automatically until cancelled. Cancel any time in Google Play → Subscriptions. Payment is charged to your Google account.{' '}
        <Link href="/terms" className="underline">Terms</Link> · <Link href="/privacy" className="underline">Privacy</Link>
      </p>
    </div>
  );
}

