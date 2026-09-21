'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { resolveTheme, type Theme } from '@/lib/theme';

/**
 * The member's theme preference, and where it is allowed to show.
 *
 * Two things were wrong here.
 *
 * The preference was applied to the whole site. This provider read
 * localStorage on mount and put the `light` class on <html> on every page
 * for anyone, so a member who switched to light and signed out left the
 * landing page, login and every public page in light mode for good. The
 * class is now set from resolveTheme (lib/theme): the preference applies
 * only inside the app shell — the member and admin layouts mount
 * <AppThemeScope /> to say so — and only while signed in. Sign out, or
 * step onto a public page, and the site is dark again. The preference is
 * kept, so it is back the instant they sign in.
 *
 * And the Firestore sync was dead. The provider sat OUTSIDE AuthProvider
 * in the root layout, so its useAuth() only ever saw the context default
 * (user: null): the "load the saved theme on login" effect never ran and
 * the toggle never persisted. It now sits inside AuthProvider.
 */

interface ThemeContextValue {
  /** The saved preference — what the toggle shows, not what is on screen. */
  theme: Theme;
  toggleTheme: () => void;
  /** Set by AppThemeScope. Not for pages. */
  setInAppShell: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  setInAppShell: () => {},
});

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('light', t === 'light');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<Theme>('dark');
  const [inAppShell, setInAppShell] = useState(false);
  const { user } = useAuth();
  const signedIn = !!user;

  // On mount: local storage first (instant), then Firestore (authoritative).
  useEffect(() => {
    try {
      const local = localStorage.getItem('theme') as Theme | null;
      if (local === 'light' || local === 'dark') setPreference(local);
    } catch { /* private mode — stay dark */ }
  }, []);

  // When the user signs in: their saved theme from Firestore.
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'userPreferences', user.uid))
      .then((snap) => {
        if (!snap.exists()) return;
        const saved = snap.data()?.theme as Theme | undefined;
        if (saved === 'light' || saved === 'dark') {
          setPreference(saved);
          try { localStorage.setItem('theme', saved); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, [user]);

  // The one place the class is written. Re-evaluated whenever the
  // preference, the session or the shell changes — which is what makes
  // signing out, or navigating to a public page, snap back to dark.
  useEffect(() => {
    applyTheme(resolveTheme({ preference, signedIn, inAppShell }));
  }, [preference, signedIn, inAppShell]);

  const toggleTheme = useCallback(() => {
    setPreference((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', next); } catch { /* ignore */ }
      // Persist so other browsers/devices pick it up.
      if (user) {
        setDoc(doc(db, 'userPreferences', user.uid), { theme: next }, { merge: true })
          .catch(() => {});
      }
      return next;
    });
  }, [user]);

  return (
    <ThemeContext.Provider value={{ theme: preference, toggleTheme, setInAppShell }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Mounted by the app and admin layouts, nowhere else. While it is mounted
 * the member's preference may show; when the layout unmounts (a navigation
 * to a public page) the flag clears and the site goes dark. Scoping by
 * layout rather than by path means a route can never be misclassified —
 * whichever layout renders decides.
 */
export function AppThemeScope() {
  const { setInAppShell } = useContext(ThemeContext);
  useEffect(() => {
    setInAppShell(true);
    return () => setInAppShell(false);
  }, [setInAppShell]);
  return null;
}

export function useTheme() {
  return useContext(ThemeContext);
}
