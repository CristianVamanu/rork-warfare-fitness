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

import { useEffect, useRef, useState, useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemConfig, getMembershipConfig } from '@/lib/firestore';
import { hasActiveSubscription, isInFreeTrial } from '@/lib/membership';
import type { MembershipConfig } from '@/types';
import { getYouTubeEmbedUrl } from '@/lib/utils';
import { Modal } from './Modal';
import { Button } from './Button';

export function WelcomeVideo() {
  const { user, profile } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'trainer';
  // A no-card free trial grants access with no subscription on the profile
  // at all: the window runs from account creation (see MembershipGuard). So
  // "has a subscription" alone never opened this for a trial member, which
  // under that mode is every new signup. Also open when membership is
  // switched off entirely, where everyone has access.
  const [membershipCfg, setMembershipCfg] = useState<MembershipConfig | null | undefined>(undefined);
  const entitled = hasActiveSubscription(profile)
    || (membershipCfg !== undefined && !!profile?.onboardingComplete
      && (!membershipCfg?.enabled || isInFreeTrial(membershipCfg, profile?.createdAt)));
  // `undefined` on a profile that simply predates this field is the same as
  // "not seen" — which is why existing members are backfilled at deploy
  // (scripts/backfill-welcome-video.mjs) rather than being shown a welcome
  // video months into their membership.
  const alreadySeen = !!profile?.welcomeVideoSeenAt;

  // The URL is fetched as soon as someone is signed in and has not seen the
  // video, not only once they are entitled. Membership lands from the Stripe
  // webhook a moment after checkout; waiting until then and only then
  // reading config put a full Firestore round trip between "paid" and the
  // modal. getSystemConfig is cached, so this costs nothing extra.
  useEffect(() => {
    if (checked || !user || alreadySeen || isStaff) return;
    setChecked(true);
    getMembershipConfig().then(setMembershipCfg).catch(() => setMembershipCfg(undefined));
    getSystemConfig()
      .then((cfg) => {
        const v = cfg?.videoGreetingUrl as string | undefined;
        if (v) setUrl(v);
      })
      // A config read that times out (it has a 3s bound) must not mark the
      // video as seen — leave it for the next page load rather than burning
      // the one chance to show it.
      .catch(() => setChecked(false));
  }, [user, alreadySeen, isStaff, checked]);

  // Opens the instant entitlement arrives, with the URL already in hand.
  useEffect(() => {
    if (url && entitled && !alreadySeen && !isStaff) setOpen(true);
  }, [url, entitled, alreadySeen, isStaff]);

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
            <WelcomeClip url={url} />
          )}
        </div>
        <p className="text-sm text-text-secondary text-center">A personal welcome to get you started.</p>
        <Button fullWidth onClick={dismiss}>Let&apos;s Go! →</Button>
      </div>
    </Modal>
  );
}

/**
 * Starts by itself, muted, so the modal opens on a moving picture instead of
 * a black box (phones only allow autoplay without sound). One tap turns the
 * sound on and restarts it from the top.
 */
function WelcomeClip({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    v.muted = true;
    v.play().catch(() => { /* blocked: the first frame and the controls still show */ });
  }, []);
  function unmute() {
    const v = ref.current; if (!v) return;
    v.muted = false; v.currentTime = 0; setMuted(false);
    v.play().catch(() => {});
  }
  return (
    <div className="relative w-full h-full">
      <video
        ref={ref}
        // #t asks the browser to paint a frame even before play, which is
        // what stops iPhone showing black.
        src={`${url}#t=0.1`}
        preload="auto"
        autoPlay
        muted
        loop={muted}
        controls={!muted}
        playsInline
        webkit-playsinline="true"
        className="w-full h-full object-contain"
      />
      {muted && (
        <button
          type="button" onClick={unmute}
          className="absolute inset-0 flex items-end justify-center pb-4 bg-gradient-to-t from-black/60 via-transparent to-transparent"
          aria-label="Play with sound"
        >
          <span className="px-4 py-2 rounded-full bg-accent text-black text-sm font-black shadow-glow-sm">🔊 Tap for sound</span>
        </button>
      )}
    </div>
  );
}
