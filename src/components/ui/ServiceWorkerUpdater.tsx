'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';

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

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
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
