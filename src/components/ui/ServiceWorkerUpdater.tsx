'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';

// A workout draft is written under this prefix by training/session/page.tsx
// (see draftStore there) on every logged set, with a lastActiveAt stamp.
const DRAFT_PREFIX = 'workout_session_';
const DRAFT_ACTIVE_MS = 30 * 60 * 1000;

function workoutInProgress(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DRAFT_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const { lastActiveAt } = JSON.parse(raw) as { lastActiveAt?: number };
      if (typeof lastActiveAt === 'number' && Date.now() - lastActiveAt < DRAFT_ACTIVE_MS) return true;
    }
  } catch { /* storage blocked — assume no session */ }
  return false;
}

// next-pwa's skipWaiting:true makes a new service worker activate in the
// background the moment it's fetched, but a page that was already open
// keeps running the OLD cached JS until something reloads it — so after a
// deploy, anyone with the app already open (or reopening a background tab
// without a full close) could keep seeing a stale version indefinitely.
// This listens for the browser handing control to the new worker and
// prompts a one-tap refresh instead of silently staying stale.
export function ServiceWorkerUpdater() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // next-pwa's script-injection only targets the Pages Router's
    // _document.js — this project uses the App Router, which it never
    // patches, so nothing else in the app calls register(). Without this,
    // /sw.js is built and served but never installed, and anything that
    // awaits navigator.serviceWorker.ready (e.g. push subscribe) hangs forever.
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('[ServiceWorker] registration failed:', err);
    });

    let handled = false;
    const onControllerChange = () => {
      if (handled) return;
      handled = true;
      // This used to call window.location.reload() 1.2s after a toast, on
      // every deploy, for every open tab — the page would visibly reload
      // itself out from under whatever you were doing. A new service worker
      // activating is not a reason to seize the page.
      //
      // The new bundle is already staged; it applies on the next navigation
      // or the next time the app is opened, either way without losing
      // anything. So this offers the reload and lets the person take it when
      // it suits them. During a workout it says nothing at all — the draft
      // survives a reload now, but interrupting someone mid-set to announce
      // a deploy is still wrong.
      if (workoutInProgress()) return;
      toast(
        (t) => (
          <span className="flex items-center gap-3">
            <span>A new version is ready.</span>
            <button
              onClick={() => { toast.dismiss(t.id); window.location.reload(); }}
              className="font-bold text-accent hover:underline whitespace-nowrap"
            >
              Reload
            </button>
          </span>
        ),
        { icon: '\u2728', duration: 12000 },
      );
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}
