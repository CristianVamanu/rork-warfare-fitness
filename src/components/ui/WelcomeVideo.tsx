'use client';

/**
 * The welcome video, shown once, the moment someone actually gets access.
 *
 * It used to live at the end of onboarding, which meant almost nobody saw it:
 * anyone who arrived with a plan selected went straight to Stripe from
 * `proceedToApp()` and was returned to /profile, never back to onboarding. The
 * one screen it played on was the screen paying members skipped.
 *
 * So the trigger is the ENTITLEMENT, not a route. AuthContext already holds a
 * live onSnapshot on the user document, so when the Stripe webhook writes
 * membership this fires wherever the member happens to be standing — right
 * behind the "Payment received" screen, on their first real page of the app.
 * That also covers every other way access is granted: a trial starting, a plan
 * change, an admin granting it by hand.
 *
 * Seen-state lives on the user document, not localStorage: it is once per
 * ACCOUNT, so it does not replay on their laptop, in a private window, or
 * after clearing site data.
 */

import { useEffect, useState, useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemConfig } from '@/lib/firestore';
import { hasActiveSubscription } from '@/lib/membership';
import { getYouTubeEmbedUrl } from '@/lib/utils';
import { Modal } from './Modal';
import { Button } from './Button';

export function WelcomeVideo() {
  const { user, profile } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'trainer';
  const entitled = hasActiveSubscription(profile);
  // `undefined` on a profile that simply predates this field is the same as
  // "not seen" — which is why existing members are backfilled at deploy
  // (scripts/backfill-welcome-video.mjs) rather than being shown a welcome
  // video months into their membership.
  const alreadySeen = !!profile?.welcomeVideoSeenAt;

  useEffect(() => {
    if (checked || !user || !entitled || alreadySeen || isStaff) return;
    setChecked(true);
    getSystemConfig()
      .then((cfg) => {
        const v = cfg?.videoGreetingUrl as string | undefined;
        if (v) { setUrl(v); setOpen(true); }
      })
      // A config read that times out (it has a 3s bound) must not mark the
      // video as seen — leave it for the next page load rather than burning
      // the one chance to show it.
      .catch(() => setChecked(false));
  }, [user, entitled, alreadySeen, isStaff, checked]);

  const dismiss = useCallback(async () => {
    setOpen(false);
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { welcomeVideoSeenAt: serverTimestamp() });
    } catch {
      // Worst case it shows once more on another device. Never block the
      // member from entering the app they just paid for over a failed write.
    }
  }, [user]);

  if (!open || !url) return null;
  const embedUrl = getYouTubeEmbedUrl(url);

  return (
    <Modal open={open} dismissOnOverlay={false} onClose={dismiss} title="Welcome to the Team! 🎉">
      <div className="space-y-4">
        <div className="rounded-xl overflow-hidden bg-black aspect-video">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            // controls, and NOT muted: mobile browsers block autoplay with
            // sound, so a muted autoplay would silently play a video nobody
            // can hear. Let them press play.
            <video
              src={url}
              controls
              playsInline
              webkit-playsinline="true"
              crossOrigin="anonymous"
              className="w-full h-full object-contain"
            />
          )}
        </div>
        <p className="text-sm text-text-secondary text-center">A personal welcome to get you started.</p>
        <Button fullWidth onClick={dismiss}>Let&apos;s Go! →</Button>
      </div>
    </Modal>
  );
}
