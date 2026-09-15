'use client';

import { useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { Lightbulb } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';

/**
 * The one tip of the day, on the dashboard.
 *
 * /api/ai/tip has existed for a long time with nothing calling it — the
 * feature was built, left unwired, and then listed on a plan as something a
 * member gets. This is the screen that makes it true.
 *
 * Cost is one generation per DAY for the entire platform, not per member: the
 * route stores the day's tip at dailyTips/{date} and serves every later
 * request from it. The localStorage copy here is a second layer on top of
 * that, so reopening the dashboard is usually zero requests rather than a
 * cache hit — though it re-checks after half an hour, so an admin who
 * regenerates a bad brief reaches people who already loaded the page.
 *
 * Renders nothing at all when there is no tip, including when the member's
 * plan does not cover it (the route answers 403) — an empty "no tip today"
 * card would be worse than silence, and the grid row simply collapses.
 */
export function DailyTip() {
  const { user } = useAuth();
  const [tip, setTip] = useState<string | null>(null);

  // Re-runs when the local calendar day changes while the app stays open —
  // a PWA left resident overnight otherwise kept showing yesterday's tip
  // until something else happened to remount this.
  const [day, setDay] = useState(() => new Date().toLocaleDateString('sv-SE'));
  useEffect(() => {
    const check = () => {
      const now = new Date().toLocaleDateString('sv-SE');
      setDay((d) => (d === now ? d : now));
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    const t = setInterval(check, 60_000);
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!user) { setTip(null); return; }
    const today = day;
    const cacheKey = `dailyTip:${today}`;

    // try/catch around storage: a private window or blocked site data makes
    // these accessors throw rather than return empty.
    let cachedTip: string | null = null;
    let cachedAt = 0;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        // Older builds stored the bare sentence. Read both shapes so an
        // upgrade does not blank the card for a day.
        if (raw.startsWith('{')) {
          const parsed = JSON.parse(raw) as { t?: string; at?: number };
          if (typeof parsed.t === 'string') { cachedTip = parsed.t; cachedAt = parsed.at ?? 0; }
        } else {
          cachedTip = raw;
        }
      }
    } catch { /* no cache available — just fetch */ }

    // A tip stored before the length limit tightened is treated as a miss, so
    // this browser refetches once instead of showing the old long one all day.
    if (cachedTip && cachedTip.length > 160) { cachedTip = null; cachedAt = 0; }

    // Shown at once so the card never flashes empty on a repeat visit.
    if (cachedTip) setTip(cachedTip);

    // Then re-checked, but only if the copy has been sitting here a while.
    // Without this the browser copy outlives the day's tip: an admin who
    // regenerates a bad brief would reach nobody who had already loaded the
    // dashboard, because their browser never asked again before midnight.
    // Half an hour keeps repeat visits free while making a correction land in
    // a useful amount of time.
    const RECHECK_AFTER_MS = 30 * 60_000;
    if (cachedTip && Date.now() - cachedAt < RECHECK_AFTER_MS) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch(`/api/ai/tip?date=${today}`, { headers: { authorization: `Bearer ${token}` } });
        if (!res.ok) return; // 403 (plan does not include it), 429, offline
        const data = await res.json() as { tip?: string };
        if (cancelled || !data.tip) return;
        setTip(data.tip);
        try {
          // Only today's key is kept — yesterday's is dropped on write so
          // this never grows without bound.
          for (const k of Object.keys(localStorage)) {
            if (k.startsWith('dailyTip:') && k !== cacheKey) localStorage.removeItem(k);
          }
          localStorage.setItem(cacheKey, JSON.stringify({ t: data.tip, at: Date.now() }));
        } catch { /* non-fatal */ }
      } catch { /* offline or token refresh failed — show nothing */ }
    })();
    return () => { cancelled = true; };
  }, [user, day]);

  if (!tip) return null;

  return (
    <Card glass className="p-3.5 flex items-start gap-3.5">
      <div className="w-11 h-11 rounded-2xl bg-accent-muted flex items-center justify-center flex-shrink-0">
        <Lightbulb className="w-5 h-5 text-accent" />
      </div>
      <div className="min-w-0">
        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">Today&apos;s brief</span>
        {/* No line clamp. Length is controlled at the source — the route asks
            for one sentence and rejects a cached tip longer than that — and
            clamping here truncated mid-word with an ellipsis, which looks
            broken rather than brief. */}
        <p className="text-sm text-white mt-0.5 leading-relaxed">{tip}</p>
      </div>
    </Card>
  );
}
