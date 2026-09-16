'use client';

import { useEffect, useState } from 'react';
import { X, Download, Share, SquarePlus, Check, ExternalLink, Copy } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { getSystemConfig } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';

// BeforeInstallPromptEvent is non-standard; define a minimal interface
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SNOOZE_KEY = 'pwa_install_snoozed_until';
const SNOOZE_DAYS = 30;
const INSTALL_RECORDED_KEY = 'pwa_install_recorded';

// In-memory guard, separate from the localStorage snooze. Covers the case
// where this component gets remounted within the same page session (e.g. by
// a parent re-render or a stray key change) before the 30-day snooze would
// otherwise apply — without this, a dismissed banner could flash back on.
let dismissedThisSession = false;

function isSnoozed() {
  try {
    const val = localStorage.getItem(SNOOZE_KEY);
    return !!val && Date.now() < parseInt(val, 10);
  } catch { return false; }
}

function snooze() {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)); } catch { /* private mode */ }
}

/**
 * Instagram, TikTok, Facebook, Snapchat, X, LinkedIn and friends open links
 * in their own embedded browser, which cannot install a web app at all —
 * no beforeinstallprompt on Android, no Share → Add to Home Screen on iOS.
 * Since the marketing plan is social, this is where most first visits will
 * come from, and the old banner showed instructions there that could not
 * be followed.
 */
function detectInAppBrowser(ua: string): string | null {
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook';
  if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return 'TikTok';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  if (/Twitter|X-Client/i.test(ua)) return 'X';
  if (/LinkedInApp/i.test(ua)) return 'LinkedIn';
  if (/Line\//i.test(ua)) return 'LINE';
  if (/MicroMessenger/i.test(ua)) return 'WeChat';
  return null;
}

function detectIos(): boolean {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) return true;
  // iPadOS reports itself as a Mac; the touch points give it away.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

type Mode = 'native' | 'ios' | 'in-app';

export function PwaInstallBanner() {
  const { user, profile } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<Mode>('native');
  const [inAppName, setInAppName] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading

  // Ask only once someone has actually trained. On first open — straight
  // out of onboarding — a "Add to Home Screen" card is the first thing they
  // dismiss, and dismissing snoozes it for a month. After a session they
  // have a reason to want it there.
  const hasTrained = (profile?.statsCache?.totalWorkouts ?? 0) >= 1
    || (profile?.activeProgram?.completedWorkouts ?? 0) >= 1;

  // Check admin toggle
  useEffect(() => {
    getSystemConfig()
      .then((cfg) => {
        // default to enabled if not explicitly set to false
        const flag = cfg?.pwaInstallBannerEnabled;
        setEnabled(flag === false ? false : true);
      })
      .catch(() => setEnabled(true));
  }, []);

  // Record an install once, the first time the app is opened standalone.
  // iOS gives no install event at all, so the launch itself is the signal
  // for every platform; the admin analytics can count pwaInstalledAt.
  useEffect(() => {
    if (!user) return;
    if (!window.matchMedia('(display-mode: standalone)').matches) return;
    try {
      if (localStorage.getItem(INSTALL_RECORDED_KEY) === user.uid) return;
    } catch { /* fall through and write; a duplicate merge is harmless */ }
    if (profile && (profile as { pwaInstalledAt?: unknown }).pwaInstalledAt) {
      try { localStorage.setItem(INSTALL_RECORDED_KEY, user.uid); } catch { /* ignore */ }
      return;
    }
    setDoc(doc(db, 'users', user.uid), { pwaInstalledAt: serverTimestamp() }, { merge: true })
      .then(() => { try { localStorage.setItem(INSTALL_RECORDED_KEY, user.uid); } catch { /* ignore */ } })
      .catch(() => { /* analytics only — never surface */ });
  }, [user, profile]);

  useEffect(() => {
    if (enabled === null || enabled === false) return;
    if (dismissedThisSession) return;
    if (!hasTrained) return;

    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Already snoozed
    if (isSnoozed()) return;

    const inApp = detectInAppBrowser(navigator.userAgent);
    if (inApp) {
      setMode('in-app');
      setInAppName(inApp);
      const t = setTimeout(() => { if (!dismissedThisSession) setShow(true); }, 3000);
      return () => clearTimeout(t);
    }

    if (detectIos()) {
      setMode('ios');
      const t = setTimeout(() => { if (!dismissedThisSession) setShow(true); }, 3000);
      return () => clearTimeout(t);
    }

    // Android / desktop Chrome — wait for beforeinstallprompt
    setMode('native');
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      showTimer = setTimeout(() => { if (!dismissedThisSession) setShow(true); }, 3000);
    };
    const installed = () => { dismissedThisSession = true; snooze(); setShow(false); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
      if (showTimer) clearTimeout(showTimer);
    };
  }, [enabled, hasTrained]);

  function dismiss() {
    dismissedThisSession = true;
    snooze();
    setShow(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    dismissedThisSession = true;
    if (outcome === 'accepted') snooze();
    setShow(false);
    setDeferredPrompt(null);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/dashboard');
      toast.success('Link copied — paste it in your browser');
    } catch {
      toast.error(`Open ${window.location.host} in your browser`);
    }
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-surface-elevated border border-white/10 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
            <span className="text-base font-black text-black">W</span>
          </div>
          <div className="flex-1 min-w-0">
            {mode === 'in-app' ? (
              <>
                <p className="text-sm font-bold text-white">Open in your browser to install</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {inAppName}&apos;s built-in browser can&apos;t add apps to your home screen. Open this page in Safari or Chrome and you&apos;ll get the option.
                </p>
                <button
                  onClick={copyLink}
                  className="mt-2 flex items-center gap-1.5 bg-accent text-black text-xs font-bold px-3 py-1.5 rounded-lg"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy link
                </button>
                <p className="text-[11px] text-text-tertiary mt-1.5 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Or tap the ··· menu and choose &quot;Open in browser&quot;.
                </p>
              </>
            ) : mode === 'ios' ? (
              <>
                <p className="text-sm font-bold text-white">Add to Home Screen</p>
                <p className="text-xs text-text-secondary mt-0.5">Full screen, faster, and your reminders arrive. In Safari:</p>
                <ol className="mt-2 space-y-1.5">
                  {[
                    { icon: Share, text: <>Tap <span className="text-white font-semibold">Share</span> at the bottom of the screen</> },
                    { icon: SquarePlus, text: <>Scroll down, tap <span className="text-white font-semibold">Add to Home Screen</span></> },
                    { icon: Check, text: <>Tap <span className="text-white font-semibold">Add</span> in the top corner</> },
                  ].map((step, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-xs text-text-secondary">
                      <span className="w-6 h-6 rounded-lg bg-blue-400/15 text-blue-300 flex items-center justify-center flex-shrink-0">
                        <step.icon className="w-3.5 h-3.5" />
                      </span>
                      <span className="leading-snug">{step.text}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-white">Add to Home Screen</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Install the app for faster access, offline support, and push notifications.
                </p>
                <button
                  onClick={install}
                  className="mt-2 flex items-center gap-1.5 bg-accent text-black text-xs font-bold px-3 py-1.5 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" /> Install App
                </button>
              </>
            )}
          </div>
          <button onClick={dismiss} className="text-text-tertiary hover:text-white p-0.5 flex-shrink-0" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
