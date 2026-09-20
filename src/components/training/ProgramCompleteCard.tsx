'use client';

import { useState } from 'react';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Share2, RotateCcw, ArrowRight, Trophy, X as XIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { completionSummary } from '@/lib/programCompletion';
import { markProgramCelebrated } from '@/lib/firestore';
import { slugify } from '@/lib/slug';

/**
 * The end of a program, as a moment rather than a dead end.
 *
 * Finishing used to produce "Program complete" and a hidden Start button —
 * three months of work, then a screen with nothing on it. On a monthly
 * subscription that is a cliff the product digs for itself: the member has
 * no reason to open the app tomorrow, and the natural moment to cancel
 * arrives right on cue.
 *
 * So this gives them three things: what they actually did, a line worth
 * posting, and somewhere to go next. The share is the only part of the app
 * that is also distribution — a finisher's post is what brings the next
 * person to the standards test.
 *
 * Deliberately NOT a toast. A toast is gone in four seconds; this has to
 * survive being read, screenshotted and acted on.
 */
export function ProgramCompleteCard({
  programId,
  programName,
  totalDays,
  sessionsDone,
  totalVolumeKg,
  onDismiss,
}: {
  programId: string;
  programName: string;
  totalDays: number;
  sessionsDone: number;
  totalVolumeKg?: number;
  onDismiss: () => void;
}) {
  const { user, profile } = useAuth();
  const [sharing, setSharing] = useState(false);

  const summary = completionSummary({
    programName,
    totalDays,
    sessionsDone,
    totalVolumeKg,
    weightUnit: profile?.weightUnit === 'lbs' ? 'lbs' : 'kg',
  });
  const s = summary.stats[0];

  /**
   * Marks it seen, then hands back to the caller.
   *
   * The write is awaited but never allowed to block dismissal: if Firestore
   * is unreachable the worst case is the moment appears once more on the
   * next launch, which is far better than a card that cannot be closed.
   */
  async function dismiss() {
    if (user) await markProgramCelebrated(user.uid, programId).catch(() => {});
    onDismiss();
  }

  async function share() {
    if (!user || sharing) return;
    setSharing(true);
    try {
      // Same referral plumbing "Share this plan" uses, so a post made at the
      // proudest moment someone has with this product is also attributed
      // back to them.
      let url = `${window.location.origin}/programs/${slugify(programName)}`;
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/referral/link', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.code) url += `?ref=${data.code}`;
      } catch {
        // No referral code is a worse share, not a broken one — still send
        // the plain program link rather than failing the whole action.
      }

      if (navigator.share) {
        try {
          await navigator.share({ title: programName, text: summary.shareText, url });
        } catch {
          // A cancelled share sheet throws AbortError. Not a failure.
        }
      } else {
        await navigator.clipboard.writeText(`${summary.shareText} ${url}`);
        toast.success('Copied — paste it anywhere');
      }
    } catch {
      toast.error('Could not share right now');
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/45 bg-surface p-5 shadow-[0_0_44px_-10px_rgba(245,166,35,0.55)] wf-rise">
      {/* Same ember-and-dots surface as the workout card, so the biggest
          moment in the app belongs to the app. */}
      <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
      <div aria-hidden className="wf-dots pointer-events-none absolute inset-0" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-accent text-black flex items-center justify-center flex-shrink-0">
            <Trophy className="w-5 h-5" />
          </span>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="p-1 -m-1 text-text-tertiary hover:text-white transition-colors flex-shrink-0"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <p className="wf-readout text-[10px] font-bold text-accent mt-3">Program complete</p>
        <h3 className="text-2xl font-black text-white leading-tight mt-1">{summary.headline}</h3>

        <div className="flex flex-wrap gap-2 mt-4">
          {[s.duration, s.sessions, s.volume].filter(Boolean).map((v) => (
            <span key={v} className="rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-sm font-bold text-white tabular-nums">
              {v}
            </span>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          <Button fullWidth loading={sharing} onClick={share}>
            <Share2 className="w-4 h-4" /> Share this
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {/* Both routes out. "Again" restarts this program with the loads
                it has learned; "Next" is the library, where the switch hint
                explains that progress is kept per program. */}
            <Button
              variant="ghost"
              size="sm"
              className="justify-center"
              onClick={async () => { await dismiss(); window.location.assign(`/training/${programId}`); }}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Run it again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-center"
              onClick={async () => { await dismiss(); window.location.assign('/training?switch=1'); }}
            >
              Next program <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
