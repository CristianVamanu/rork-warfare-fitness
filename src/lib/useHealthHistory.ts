'use client';

import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
    const snaps = await Promise.all(dates.map(d => getDoc(doc(db, 'healthDays', `${uid}_${d}`)).catch(() => null)));
    const m: DayMap = new Map();
    snaps.forEach((s, i) => { if (s?.exists()) m.set(dates[i], s.data() as HealthDaySummary); });
    setDays(m);
    setLoaded(true);
  }, [uid, n]);

  useEffect(() => { reload(); }, [reload]);

  return { days, loaded, reload };
}

const BACKFILL_KEY = 'wf-health-backfill';

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
