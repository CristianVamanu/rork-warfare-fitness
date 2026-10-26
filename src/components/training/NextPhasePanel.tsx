'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Play, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { enrollInProgram, markProgramCelebrated } from '@/lib/firestore';
import { useFeatureAccess } from '@/lib/useFeatureAccess';
import type { NextProgramPlan } from '@/types';

/**
 * What the training tab shows in place of "Up next" once a program is done:
 * the next phase, already chosen, and one button to start it. While the
 * plan is still being decided (a few hundred milliseconds after the last
 * session, usually) it shows that rather than nothing.
 */
export function NextPhasePanel({ plan, finishedProgramId, lifetimeSessions }: {
  plan: NextProgramPlan | null;
  finishedProgramId: string;
  lifetimeSessions?: number;
}) {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const access = useFeatureAccess(undefined, plan?.programId);

  async function start() {
    if (!user || !plan || starting) return;
    if (access.isLocked) { router.push(`/training/${plan.programId}`); return; }
    setStarting(true);
    try {
      await enrollInProgram(user.uid, { id: plan.programId, name: plan.programName, weeks: plan.weeks, daysPerWeek: plan.daysPerWeek }, false, access.switchNeeded);
      await markProgramCelebrated(user.uid, finishedProgramId).catch(() => {});
      await refreshProfile();
      toast.success(`${plan.programName} starts now.`);
      router.push(`/training/${plan.programId}`);
    } catch (err) {
      console.error('[Chain] start next failed:', err);
      toast.error('Could not start it from here. Opening the program instead.');
      router.push(`/training/${plan.programId}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="relative rounded-2xl border border-accent/30 bg-accent/[0.07] p-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="wf-readout text-[10px] font-bold text-accent">
          {plan ? (plan.reason === 'repeat' ? 'Next · run it again' : plan.reason === 'sequence' ? 'Next in the sequence' : 'Next phase · ready') : 'Next phase'}
        </p>
        {typeof lifetimeSessions === 'number' && lifetimeSessions > 0 && (
          <p className="text-[10px] text-text-tertiary tabular-nums">{lifetimeSessions} sessions carried over</p>
        )}
      </div>
      {plan ? (
        <>
          <p className="text-xl font-black text-white leading-tight mt-1">{plan.programName}</p>
          <p className="text-xs text-text-secondary mt-0.5">{plan.weeks} weeks · {plan.daysPerWeek} days a week · day one is written</p>
          <Button fullWidth className="mt-3" loading={starting} onClick={start}>
            <Play className="w-4 h-4" /> Start {plan.programName}
          </Button>
          <button type="button" onClick={() => router.push('/training?switch=1')} className="mt-2 w-full text-center text-xs text-text-tertiary hover:text-white transition-colors inline-flex items-center justify-center gap-1">
            Choose a different program <ArrowRight className="w-3 h-3" />
          </button>
        </>
      ) : (
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin text-accent" /> Choosing what comes next from what you just did.
        </p>
      )}
    </div>
  );
}
