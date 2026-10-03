'use client';

import { useState } from 'react';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Share2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * "Send this to someone" — a challenge as a referral link. Same machinery
 * as ShareProgramButton: the member's own referral code goes on the public
 * challenge page's URL, so whoever joins through it is credited to them.
 *
 * navigator.share where it exists (every phone), clipboard everywhere
 * else. A cancelled share sheet is not an error and says nothing.
 */
export function ShareChallengeButton({ challengeId, title, entered, variant = 'button', className = '' }: {
  challengeId: string;
  title: string;
  /** Changes the wording: an entrant is bringing a partner, not forwarding a flyer. */
  entered?: boolean;
  variant?: 'button' | 'icon';
  className?: string;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function share() {
    if (!user || busy) return;
    setBusy(true);
    try {
      let code: string | null = null;
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/referral/link', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.code) code = data.code;
      } catch { /* the link still works without a code; only the credit is lost */ }

      const url = `${window.location.origin}/challenges/${challengeId}${code ? `?ref=${code}` : ''}`;
      const text = entered ? `I'm in on "${title}" on Warfare Fitness. Your turn:` : `Think you can do "${title}"? Prove it:`;

      if (navigator.share) {
        try { await navigator.share({ title, text, url }); } catch { /* cancelled */ }
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied — send it to anyone');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not share');
    } finally {
      setBusy(false);
    }
  }

  if (variant === 'icon') {
    return (
      <button type="button" onClick={share} disabled={busy} aria-label={`Share ${title}`}
        className={`p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors ${className}`}>
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
      </button>
    );
  }
  return (
    <button type="button" onClick={share} disabled={busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border border-accent/40 text-accent hover:bg-accent/10 transition-colors disabled:opacity-60 ${className}`}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
      {entered ? 'Send it to a partner' : 'Share'}
    </button>
  );
}
