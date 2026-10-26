'use client';

import { useEffect, useRef } from 'react';
import { getIdToken, type User } from 'firebase/auth';
import { shouldPlanNext } from './nextProgram';
import type { NextProgramPlan } from '@/types';

/**
 * Asks the server to plan the next program once the current one is in its
 * last stretch. Fire-and-forget: the plan lands on the profile through the
 * live listener, so nothing here needs a return value. Asked once per
 * program per page load; the route is idempotent anyway.
 */
export function useNextProgram(args: {
  user: User | null | undefined;
  activeProgramId?: string;
  pct: number;
  finished: boolean;
  plan?: NextProgramPlan | null;
  /** False until the program has resolved and pct is trustworthy. */
  ready: boolean;
}) {
  const { user, activeProgramId, pct, finished, plan, ready } = args;
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !ready || !activeProgramId) return;
    if (askedFor.current === activeProgramId) return;
    if (!shouldPlanNext({ activeProgramId, pct, finished, plan })) return;
    askedFor.current = activeProgramId;
    (async () => {
      try {
        const token = await getIdToken(user);
        await fetch('/api/programs/next', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch {
        // The training tab simply shows no plan line; the completion card
        // falls back to the library. Nothing breaks, it just plans later.
        askedFor.current = null;
      }
    })();
  }, [user, ready, activeProgramId, pct, finished, plan]);
}
