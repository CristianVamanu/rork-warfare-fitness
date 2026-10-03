'use client';

import { useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { initInstallCapture, isStandalone } from '@/lib/pwaInstall';

const INSTALL_RECORDED_KEY = 'pwa_install_recorded';

/**
 * Mounted once in the app layout. It no longer draws anything: the ask to
 * install moved to the strip at the top of the home screen
 * (components/app/InstallAppStrip), which is always visible in a browser
 * tab and opens device-specific steps. What stays here is app-wide work:
 * catching the browser's one-shot install event before the home screen
 * mounts, and recording the first standalone launch for the admin stats.
 */
export function PwaInstallBanner() {
  const { user, profile } = useAuth();

  useEffect(() => { initInstallCapture(); }, []);

  // Record an install once, the first time the app is opened standalone.
  // iOS gives no install event at all, so the launch itself is the signal
  // for every platform; the admin analytics can count pwaInstalledAt.
  useEffect(() => {
    if (!user) return;
    if (!isStandalone()) return;
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

  return null;
}
