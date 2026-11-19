'use client';

/**
 * "Share my pull": the phone's own share sheet where there is one, the
 * clipboard otherwise. The link opens the public Ripz page with the pull in
 * it, so the friend sees the number to beat before they rip their own. A
 * member's link carries their referral code, which is what pays out the
 * free month if that friend goes on to subscribe (lib/referralReward).
 */
import { Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { funnelHit } from '@/lib/funnel';
import type { RipzChallenge } from '@/lib/ripz';

export function ripzShareUrl(origin: string, c: RipzChallenge, ref?: string | null): string {
  const q = new URLSearchParams({ n: String(c.count), m: c.move.id });
  if (ref) q.set('ref', ref);
  return `${origin}/ripz?${q.toString()}`;
}

export function RipzShare({ challenge, getRef }: {
  challenge: RipzChallenge;
  /** Resolves the member's referral code, or null. Omitted on the public page. */
  getRef?: () => Promise<string | null>;
}) {
  async function share() {
    const ref = getRef ? await getRef().catch(() => null) : null;
    const url = ripzShareUrl(window.location.origin, challenge, ref);
    const text = `I pulled ${challenge.count} ${challenge.move.name.toLowerCase()} on Ripz. What do you get?`;
    funnelHit('ripz_share');
    try {
      if (navigator.share) { await navigator.share({ title: 'Ripz', text, url }); return; }
    } catch (err) {
      // Closing the share sheet is not a failure, and needs no fallback.
      if ((err as { name?: string })?.name === 'AbortError') return;
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast.success('Link copied. Send it to a friend.'); }
    catch { toast.error('Could not copy the link'); }
  }
  return <Button fullWidth variant="secondary" onClick={share}><Share2 className="w-4 h-4" /> Share my pull</Button>;
}
