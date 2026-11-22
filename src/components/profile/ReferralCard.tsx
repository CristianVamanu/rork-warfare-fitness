'use client';

import { useState, useEffect } from 'react';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Users, Copy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * "X people started training because of you."
 *
 * Self-contained and self-fetching, same pattern as the dashboard's other
 * small widgets — the profile page is already large and this needs nothing
 * from it beyond being signed in. Fetches once on mount; the count moving
 * while the page is open is not something anyone needs to watch update
 * live, so there is no listener here, just a plain GET.
 *
 * Hidden only while loading. It used to hide at zero joins, when a count
 * was all it had to say; now it carries the offer (a month free for both
 * sides, see lib/referralReward), which is the reason to share at all.
 */
export function ReferralCard() {
  const { user } = useAuth();
  const [data, setData] = useState<{ code: string; joinCount: number; rewardCount: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/referral/link', { headers: { Authorization: `Bearer ${token}` } });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && body.code) setData({ code: body.code, joinCount: body.joinCount ?? 0, rewardCount: body.rewardCount ?? 0 });
      } catch { /* silent — this card just doesn't render */ }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function copyLink() {
    if (!data) return;
    try {
      // No specific program here (that's ShareProgramButton's job, on the
      // training page) — this is the general link, so it goes straight to
      // the quiz. /training is behind the auth wall and would bounce a
      // signed-out visitor before onboarding's ?ref= handler ever saw the
      // code; onboarding is the actual front door for someone with no
      // account yet.
      await navigator.clipboard.writeText(`${window.location.origin}/onboarding?ref=${data.code}`);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy — select the text instead');
    }
  }

  if (!loaded) return null; // no skeleton flash for a card that may not render at all
  if (!data) return null;

  return (
    <Card className="pf-card p-4 flex items-center gap-3">
      <span aria-hidden className="pf-art" style={{ backgroundImage: 'url(/profile/referral.webp)' }} />
      <div className="pf-ic">
        <Users className="w-6 h-6 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-white">
          Give a month, get a month
        </p>
        <p className="text-xs text-text-secondary">
          When a friend joins through your link and pays for their first month, you both get a month free.
          {data.joinCount > 0 && ` ${data.joinCount} joined so far`}{data.rewardCount > 0 && `, ${data.rewardCount} free ${data.rewardCount === 1 ? 'month' : 'months'} earned`}{data.joinCount > 0 && '.'}
        </p>
      </div>
      <button
        onClick={copyLink}
        className="p-2 rounded-lg text-text-tertiary hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
        aria-label="Copy your referral link"
        title="Copy link"
      >
        <Copy className="w-4 h-4" />
      </button>
    </Card>
  );
}
