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
export function useHealthHistory(uid: string | undefined, n = 30) {
  const [days, setDays] = useState<DayMap>(new Map());
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!uid) return;
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
    setDays(m);
    setLoaded(true);
  }, [uid, n]);

  useEffect(() => { reload(); }, [reload]);

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
