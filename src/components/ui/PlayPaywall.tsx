'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle, Crown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { loadPackages, buyPackage, restore, revenueCatLog, type StorePackage } from '@/lib/native/purchases';
import { getMembershipPlans } from '@/lib/firestore';
import type { MembershipPlan } from '@/types';

/** Google Play subscriptions (RevenueCat), shown only inside the app when configured. */
export function PlayPaywall({ uid }: { uid: string }) {
  const [pkgs, setPkgs] = useState<StorePackage[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The same plan cards as the website (Vanguard = monthly, Hero = yearly),
  // each sold through its Google Play base plan at Google Play's price.
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  useEffect(() => {
    let alive = true;
    getMembershipPlans().then((all) => { if (alive) setPlans(all.filter((x) => x.active)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
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
        {revenueCatLog().length > 0 && (
          <pre className="text-left text-[9px] leading-snug text-text-tertiary whitespace-pre-wrap break-words max-h-48 overflow-auto">{revenueCatLog().join('\n')}</pre>
        )}
      </div>
    );
  }
  if (!pkgs) return <Loader2 className="w-5 h-5 animate-spin text-accent mx-auto" />;
  const go = async (pkg: StorePackage) => {
    setPick(pkg.id); setBusy('buy'); setMsg(null);
    try { if (await buyPackage(uid, pkg)) setMsg('Purchase complete. Unlocking your membership…'); }
    catch { setMsg('The purchase did not go through. You have not been charged.'); }
    finally { setBusy(null); }
  };
  // Website plan for a Play package: the monthly package is the plan sold
  // monthly; the yearly package is the plan sold only as 12 months.
  const planFor = (p: StorePackage): MembershipPlan | null => {
    if (p.period === 'year') return plans.find((x) => x.price12mo && !x.priceMonthly) ?? plans.find((x) => x.price12mo) ?? null;
    if (p.period === 'month') return plans.find((x) => x.priceMonthly) ?? null;
    return null;
  };
  const ordered = [...pkgs].sort((a, b) => (a.period === 'month' ? 0 : 1) - (b.period === 'month' ? 0 : 1));
  const back = async () => {
    setBusy('restore'); setMsg(null);
    try { setMsg((await restore(uid)) ? 'Purchases restored. Unlocking your membership…' : 'No active Google Play subscription found for this account.'); }
    catch { setMsg('Could not reach Google Play. Try again in a moment.'); }
    finally { setBusy(null); }
  };
  return (
    <div className="space-y-4 text-left">
      {ordered.map((p) => {
        const plan = planFor(p);
        const buying = busy === 'buy' && pick === p.id;
        return (
          <div key={p.id} className="rounded-2xl border border-white/10 bg-surface p-5">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-accent">
              <Crown className="w-4 h-4" /> {plan?.name ?? (p.period === 'year' ? 'Yearly' : p.period === 'month' ? 'Monthly' : p.title)}
            </p>
            <div className="flex items-baseline gap-2 mt-2 flex-wrap">
              <span className="text-3xl font-black text-white">{p.price}</span>
              <span className="text-sm text-text-secondary">{p.period === 'year' ? '/ 12mo' : p.period === 'month' ? '/month' : ''}</span>
            </div>
            {p.trial && <p className="text-xs text-accent mt-1">{p.trial} free trial included</p>}
            {plan?.description && <p className="text-xs text-text-secondary mt-2 leading-relaxed">{plan.description}</p>}
            {!!plan?.features?.length && (
              <ul className="mt-4 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-text-secondary">
                    <CheckCircle className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5">
              <Button fullWidth onClick={() => go(p)} disabled={!!busy}>
                {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Crown className="w-4 h-4" /> Subscribe with Google Play</>}
              </Button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={back} disabled={!!busy} className="w-full text-xs font-semibold text-accent py-1">{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</button>
      {msg && <p className="text-sm text-text-secondary text-center" role="status">{msg}</p>}
      <p className="text-[11px] text-text-tertiary leading-relaxed text-center">
        Renews automatically until cancelled. Cancel any time in Google Play → Subscriptions. Payment is charged to your Google account.{' '}
        <Link href="/terms" className="underline">Terms</Link> · <Link href="/privacy" className="underline">Privacy</Link>
      </p>
    </div>
  );
}

