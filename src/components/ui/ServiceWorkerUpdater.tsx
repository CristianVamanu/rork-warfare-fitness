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

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      // This used to reload unconditionally 1.2s after the toast. With
      // frequent deploys that meant a live workout — rest timer running,
      // mid-set — could have the page yanked out from under it. The draft
      // now survives a reload (localStorage), but the interruption itself is
      // still wrong: a person at the squat rack does not want a reload. If a
      // session is active, say the update is ready and leave the reload to
      // them (the next cold open picks it up anyway).
      if (workoutInProgress()) {
        toast('Update ready — it will apply after your workout.', { icon: '🔄', duration: 6000 });
        return;
      }
      toast('A new version is available.', {
        icon: '🔄',
        duration: 8000,
      });
      // Give the toast a moment to render before reloading.
      setTimeout(() => window.location.reload(), 1200);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}
