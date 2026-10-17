'use client';

import { useState } from 'react';
import { getIdToken } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Share2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { slugify } from '@/lib/slug';

/**
 * "Share this plan" — turns the program someone is training on into a
 * referral link, and credits them when it brings someone in.
 *
 * The shared page is /programs/[slug] (already public, already a teaser —
 * exercises, sets and reps have never been on that page; see its own
 * comment for why). This button's only job is to fetch or create the
 * member's own referral code and append it as ?ref=, so the join can be
 * attributed back to them.
 *
 * navigator.share opens the native share sheet where it exists (every
 * mobile browser, this being the surface someone is actually training
 * from); everywhere else the link is copied to the clipboard and a toast
 * says so, matching the copy-link pattern already used elsewhere in the
 * app (LeadsPanel's "Copy email").
 */
export function ShareProgramButton({ programId, programName }: { programId: string; programName: string }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function share() {
    if (!user || busy) return;
    setBusy(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/referral/link', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.code) throw new Error(data.error || 'Could not get a share link');

      const url = `${window.location.origin}/programs/${slugify(programName)}?ref=${data.code}`;
      const text = `I'm training on ${programName}. Join me:`;

      if (navigator.share) {
        try {
          await navigator.share({ title: programName, text, url });
        } catch {
          // AbortError on a cancelled share sheet is the normal case, not
          // a failure — nothing to report either way.
        }
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied — send it to anyone');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not share this program');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" className="justify-center" onClick={share} disabled={busy} aria-label={`Share ${programName}`}>
      <Share2 className="w-4 h-4" /> Share
    </Button>
  );
}
