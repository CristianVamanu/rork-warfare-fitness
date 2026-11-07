'use client';

import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { getIdToken } from 'firebase/auth';
import { lastDays, type DayMap } from '@/lib/healthTrends';
import type { HealthDaySummary } from '@/lib/native/health';

/**
 * Reads the stored healthDays for the last `n` days. Docs are keyed
 * {uid}_{date}, so this is n direct gets: no composite index, and the rules
 * already allow a user to read their own days.
 */
// Kept for the whole app session, so going to another screen and back shows
// the numbers at once instead of reloading them every time.
const memo = new Map<string, { days: DayMap; at: number }>();
const FRESH_MS = 5 * 60_000;

export function useHealthHistory(uid: string | undefined, n = 30) {
  const key = `${uid ?? ''}:${n}`;
  const [days, setDays] = useState<DayMap>(() => memo.get(key)?.days ?? new Map());
  const [loaded, setLoaded] = useState(() => memo.has(key));

  /** force: skip the 5-minute freshness check (after a sync from the phone). */
  const reload = useCallback(async (force = true) => {
    if (!uid) return;
    const hit = memo.get(`${uid}:${n}`);
    if (!force && hit && Date.now() - hit.at < FRESH_MS) { setDays(hit.days); setLoaded(true); return; }
    const dates = lastDays(n);
    const m: DayMap = new Map();
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await getIdToken(user);
      const res = await fetch(`/api/health/days?dates=${dates.join(',')}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const json = await res.json() as { days: HealthDaySummary[] };
        for (const d of json.days) if (d?.date) m.set(d.date, d);
      } else {
        // Fallback: direct reads (work wherever the healthDays rule is published).
        const snaps = await Promise.all(dates.map(d => getDoc(doc(db, 'healthDays', `${uid}_${d}`)).catch(() => null)));
        snaps.forEach((s, i) => { if (s?.exists()) m.set(dates[i], s.data() as HealthDaySummary); });
      }
    } catch { /* leave empty; the next sync retries */ }
    // A failed read keeps what was already showing rather than blanking it.
    if (m.size || !hit) memo.set(`${uid}:${n}`, { days: m, at: Date.now() });
    setDays(m.size || !hit ? m : hit.days);
    setLoaded(true);
  }, [uid, n]);

  useEffect(() => { reload(false); }, [reload]);

  return { days, loaded, reload };
}

// v2: forces one fresh 30-day read after the clock-change fix.
const BACKFILL_KEY = 'wf-health-backfill-v2';

/**
 * How many days to read from the phone on this sync: the full month once a
 * day (so the baseline and charts fill in, and late-arriving watch data is
 * picked up), otherwise the last 3.
 */
export function syncWindow(): number {
  try {
    const today = new Date().toDateString();
    if (localStorage.getItem(BACKFILL_KEY) === today) return 3;
    return 30;
  } catch { return 3; }
}

export function markBackfilled() {
  try { localStorage.setItem(BACKFILL_KEY, new Date().toDateString()); } catch { /* storage blocked */ }
}
