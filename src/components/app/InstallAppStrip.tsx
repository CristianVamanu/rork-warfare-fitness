'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Smartphone, ChevronRight, X, Share, SquarePlus, Check, Download, MoreVertical, Copy, ExternalLink, Monitor, Bell, Zap, Maximize } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { getSystemConfig } from '@/lib/firestore';
import {
  detectPlatform, hasNativePrompt, promptInstall, subscribeInstall, isStandalone,
  type InstallPlatform,
} from '@/lib/pwaInstall';

/**
 * The "install the app" line at the top of the home screen.
 *
 * Shown only in a browser tab: once the app is opened from the home screen
 * it never appears, because that is the whole point of it. Tapping it opens
 * a sheet with the steps for the device in hand (iPhone Safari, Android
 * Chrome, desktop, or the Instagram-style in-app browser that cannot
 * install anything), and on Android and desktop Chrome a real Install
 * button that opens the browser's own dialog.
 *
 * The X hides it for a week, not a month: this is the one ask that makes
 * the product feel like an app, and a member who waved it away on day one
 * usually wants it by day eight. The admin switch in Settings turns it off
 * entirely.
 */

const HIDE_KEY = 'wf_install_strip_hidden_until';
const HIDE_DAYS = 7;

function hiddenNow(): boolean {
  try {
    const v = localStorage.getItem(HIDE_KEY);
    return !!v && Date.now() < Number(v);
  } catch { return false; }
}

export function InstallAppStrip() {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [inAppName, setInAppName] = useState<string | null>(null);
  const [native, setNative] = useState(false);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const { platform: p, inAppName: n } = detectPlatform();
    setPlatform(p);
    setInAppName(n);
    setNative(hasNativePrompt());
    const off = subscribeInstall(() => {
      setNative(hasNativePrompt());
      if (isStandalone()) { setVisible(false); setOpen(false); }
    });
    if (p === 'installed' || hiddenNow()) return off;
    let alive = true;
    getSystemConfig()
      .then((cfg) => { if (alive && cfg?.pwaInstallBannerEnabled !== false) setVisible(true); })
      .catch(() => { if (alive) setVisible(true); });
    return () => { alive = false; off(); };
  }, []);

  function hide() {
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86_400_000)); } catch { /* private mode */ }
    setVisible(false);
  }

  async function nativeInstall() {
    const ok = await promptInstall();
    if (ok) { toast.success('Installed. Open it from your home screen.'); setOpen(false); setVisible(false); }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/dashboard');
      toast.success('Link copied. Paste it in Safari or Chrome.');
    } catch {
      toast.error(`Open ${window.location.host} in your browser`);
    }
  }

  if (!visible || !platform || platform === 'installed') return null;

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-surface wf-rise">
        <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
        <div aria-hidden className="wf-dots pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex-1 min-w-0 flex items-center gap-3 pl-3 pr-2 py-2.5 text-left"
          >
            <span className="w-9 h-9 rounded-xl bg-gradient-accent text-black flex items-center justify-center flex-shrink-0 shadow-glow-sm">
              <Smartphone className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white leading-tight">Install the app</span>
              <span className="block text-[11px] text-text-secondary leading-snug truncate">Full screen, faster, and your reminders arrive. 20 seconds.</span>
            </span>
            <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[12px] font-bold text-accent">
              How <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </button>
          <button
            type="button"
            onClick={hide}
            aria-label="Hide for a week"
            className="p-2.5 mr-1 rounded-lg text-text-tertiary hover:text-white flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Install Warfare Fitness">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Zap, t: 'Opens instantly', s: 'From your home screen' },
              { icon: Bell, t: 'Reminders', s: 'Training and streak alerts' },
              { icon: Maximize, t: 'Full screen', s: 'No browser bars' },
            ].map(({ icon: Icon, t, s }) => (
              <div key={t} className="rounded-xl border border-white/10 bg-black/25 p-2.5">
                <Icon className="w-4 h-4 text-accent" />
                <p className="text-[12px] font-bold text-white leading-tight mt-1.5">{t}</p>
                <p className="text-[10px] text-text-tertiary leading-snug mt-0.5">{s}</p>
              </div>
            ))}
          </div>

          {platform === 'in-app' && (
            <Steps
              intro={`${inAppName ?? 'This app'}'s built-in browser cannot add apps to your home screen. Open the site in your normal browser first, then install from there.`}
              steps={[
                { icon: MoreVertical, text: <>Tap the <b className="text-white">⋯</b> menu in the corner</> },
                { icon: ExternalLink, text: <>Choose <b className="text-white">Open in browser</b> (or Open in Safari / Chrome)</> },
                { icon: Smartphone, text: <>Log in, then tap <b className="text-white">Install the app</b> again on the home screen</> },
              ]}
              action={<button type="button" onClick={copyLink} className="w-full min-h-[48px] rounded-xl bg-gradient-accent text-black font-bold text-sm flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Copy the link instead</button>}
            />
          )}

          {platform === 'ios-other' && (
            <Steps
              intro={`On iPhone the reliable way to install is from Safari. ${inAppName ?? 'This browser'} often hides the option or does not have it.`}
              steps={[
                { icon: Copy, text: <>Copy the link below</> },
                { icon: ExternalLink, text: <>Open <b className="text-white">Safari</b> and paste it in the address bar</> },
                { icon: Share, text: <>Tap <b className="text-white">Share</b>, then <b className="text-white">Add to Home Screen</b>, then <b className="text-white">Add</b></> },
              ]}
              action={<button type="button" onClick={copyLink} className="w-full min-h-[48px] rounded-xl bg-gradient-accent text-black font-bold text-sm flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Copy the link</button>}
              footnote={`On newer iPhones ${inAppName ?? 'this browser'} can also do it: tap the Share icon in the address bar and look for Add to Home Screen. If it is not there, use Safari.`}
            />
          )}

          {platform === 'ios' && (
            <Steps
              intro="On iPhone and iPad, in Safari:"
              steps={[
                { icon: Share, text: <>Tap <b className="text-white">Share</b>, the square with the arrow, at the bottom of the screen</> },
                { icon: SquarePlus, text: <>Scroll down and tap <b className="text-white">Add to Home Screen</b></> },
                { icon: Check, text: <>Tap <b className="text-white">Add</b> in the top corner, then open it from your home screen</> },
              ]}
            />
          )}

          {platform === 'android' && (
            native ? (
              <Steps
                intro="One tap. Your browser will ask to confirm."
                steps={[]}
                action={<button type="button" onClick={nativeInstall} className="w-full min-h-[52px] rounded-xl bg-gradient-accent text-black font-black text-base flex items-center justify-center gap-2 shadow-glow-sm"><Download className="w-5 h-5" /> Install now</button>}
              />
            ) : (
              <Steps
                intro="In Chrome:"
                steps={[
                  { icon: MoreVertical, text: <>Tap the <b className="text-white">⋮</b> menu at the top right</> },
                  { icon: Download, text: <>Tap <b className="text-white">Install app</b> or <b className="text-white">Add to Home screen</b></> },
                  { icon: Check, text: <>Tap <b className="text-white">Install</b>, then open it from your home screen</> },
                ]}
                footnote="Samsung Internet: tap the menu at the bottom, then Add page to, then Home screen."
              />
            )
          )}

          {platform === 'desktop' && (
            native ? (
              <Steps
                intro="Install it as an app on this computer. It opens in its own window."
                steps={[]}
                action={<button type="button" onClick={nativeInstall} className="w-full min-h-[52px] rounded-xl bg-gradient-accent text-black font-black text-base flex items-center justify-center gap-2 shadow-glow-sm"><Download className="w-5 h-5" /> Install now</button>}
              />
            ) : (
              <Steps
                intro="Best on your phone: open this site there and follow the steps. On this computer, in Chrome or Edge:"
                steps={[
                  { icon: Monitor, text: <>Click the <b className="text-white">install icon</b> at the right of the address bar</> },
                  { icon: Check, text: <>Click <b className="text-white">Install</b></> },
                ]}
                footnote="Safari on Mac: File, then Add to Dock."
              />
            )
          )}
        </div>
      </Modal>
    </>
  );
}

function Steps({ intro, steps, action, footnote }: {
  intro: string;
  steps: { icon: React.ElementType; text: React.ReactNode }[];
  action?: React.ReactNode;
  footnote?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary leading-relaxed">{intro}</p>
      {steps.length > 0 && (
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="relative overflow-hidden flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
              <span className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center flex-shrink-0 relative">
                <s.icon className="w-4 h-4" />
                <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-gradient-accent text-black text-[9px] font-black flex items-center justify-center">{i + 1}</span>
              </span>
              <span className="text-[13px] text-text-secondary leading-snug">{s.text}</span>
            </li>
          ))}
        </ol>
      )}
      {action}
      {footnote && <p className="text-[11px] text-text-tertiary leading-relaxed">{footnote}</p>}
    </div>
  );
}
