'use client';

/**
 * Everything the app needs to know about "can this be installed, and how".
 *
 * The browser fires `beforeinstallprompt` once, early, usually before the
 * dashboard has mounted. Whatever listens for it has to be registered at
 * app start and keep the event, so the home-screen strip can use it later.
 * That is what the capture below does: the app layout calls
 * `initInstallCapture()` once, and any component can then ask whether a
 * native prompt is available and subscribe to changes.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'installed' | 'in-app' | 'ios' | 'ios-other' | 'android' | 'desktop';

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let started = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function initInstallCapture(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    notify();
  });
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function hasNativePrompt(): boolean {
  return deferred !== null;
}

/** Shows the browser's own install dialog. Resolves true when accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  deferred = null;
  notify();
  return outcome === 'accepted';
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (installedNow) return true;
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * Instagram, TikTok, Facebook and friends open links in their own embedded
 * browser, which cannot install a web app at all. Social is where most
 * first visits come from, so this case gets its own instructions.
 */
export function detectInAppBrowser(ua: string): string | null {
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

export function detectIos(): boolean {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; the touch points give it away.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function detectPlatform(): { platform: InstallPlatform; inAppName: string | null } {
  if (isStandalone()) return { platform: 'installed', inAppName: null };
  const inApp = detectInAppBrowser(navigator.userAgent);
  if (inApp) return { platform: 'in-app', inAppName: inApp };
  if (detectIos()) {
    // Chrome, Firefox and Edge on iPhone. Newer versions can add to the home
    // screen from their Share menu, but it is hidden and older iOS cannot,
    // so these visitors are sent to Safari, which always works.
    const other = /CriOS/i.test(navigator.userAgent) ? 'Chrome'
      : /FxiOS/i.test(navigator.userAgent) ? 'Firefox'
      : /EdgiOS/i.test(navigator.userAgent) ? 'Edge' : null;
    if (other) return { platform: 'ios-other', inAppName: other };
    return { platform: 'ios', inAppName: null };
  }
  if (/android/i.test(navigator.userAgent)) return { platform: 'android', inAppName: null };
  return { platform: 'desktop', inAppName: null };
}
