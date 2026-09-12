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
 * Cost is one generation per DAY for the entire platform, not per member:
 * the route caches the day's tip at config/dailyTip and serves every later
 * request from it. The localStorage copy here is a second layer on top of
 * that, so reopening the dashboard ten times in a day is zero requests
 * rather than ten cache hits.
 *
 * Renders nothing at all when there is no tip, including when the member's
 * plan does not cover it (the route answers 403) — an empty "no tip today"
 * card would be worse than silence, and the grid row simply collapses.
 */
export function DailyTip() {
  const { user } = useAuth();
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setTip(null); return; }
    const today = new Date().toLocaleDateString('sv-SE');
    const cacheKey = `dailyTip:${today}`;

    // try/catch around storage: a private window or blocked site data makes
    // these accessors throw rather than return empty.
    try {
      const cached = localStorage.getItem(cacheKey);
      // A tip stored before the length limit tightened is treated as a miss,
      // so this browser refetches once instead of showing the old long one
      // for the rest of the day. The server applies the same rule.
      if (cached && cached.length <= 160) { setTip(cached); return; }
    } catch { /* no cache available — just fetch */ }

    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/ai/tip', { headers: { authorization: `Bearer ${token}` } });
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
          localStorage.setItem(cacheKey, data.tip);
        } catch { /* non-fatal */ }
      } catch { /* offline or token refresh failed — show nothing */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

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
