'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('light', t === 'light');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const { user } = useAuth();

  // On mount: local storage first (instant), then Firestore (authoritative)
  useEffect(() => {
    const local = localStorage.getItem('theme') as Theme | null;
    if (local === 'light' || local === 'dark') {
      setTheme(local);
      applyTheme(local);
    }
  }, []);

  // When user logs in: load their saved theme from Firestore
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'userPreferences', user.uid))
      .then((snap) => {
        if (!snap.exists()) return;
        const saved = snap.data()?.theme as Theme | undefined;
        if (saved === 'light' || saved === 'dark') {
          setTheme(saved);
          localStorage.setItem('theme', saved);
          applyTheme(saved);
        }
      })
      .catch(() => {});
  }, [user]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      applyTheme(next);
      // Persist to Firestore so other browsers/devices pick it up
      if (user) {
        setDoc(doc(db, 'userPreferences', user.uid), { theme: next }, { merge: true })
          .catch(() => {});
      }
      return next;
    });
  }, [user]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
