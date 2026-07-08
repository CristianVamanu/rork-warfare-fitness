'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserDoc } from '@/lib/firestore';
import en from '@/locales/en.json';
import ro from '@/locales/ro.json';

export type Language = 'en' | 'ro';

const DICTIONARIES: Record<Language, Record<string, string>> = { en, ro };

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ro: 'Română',
};

const STORAGE_KEY = 'app_language';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [language, setLanguageState] = useState<Language>('en');

  // On mount: apply whatever was last chosen on this device immediately,
  // so the UI doesn't flash English before the user's profile loads.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && DICTIONARIES[stored]) setLanguageState(stored);
  }, []);

  // Once the profile loads, its saved preference (synced across devices)
  // wins over whatever was cached locally. But if the profile has never
  // had a language set — e.g. someone picked Romanian on the public
  // landing page before registering — carry that local choice over to
  // their brand-new profile instead of silently reverting to English,
  // so the choice they made before signing up actually sticks.
  useEffect(() => {
    if (!profile) return;
    const profileLang = (profile as { language?: Language } | null)?.language;
    if (profileLang && DICTIONARIES[profileLang]) {
      setLanguageState(profileLang);
      localStorage.setItem(STORAGE_KEY, profileLang);
    } else {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored && DICTIONARIES[stored] && user) {
        updateUserDoc(user.uid, { language: stored }).catch(() => {});
      }
    }
  }, [profile, user]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    if (user) {
      updateUserDoc(user.uid, { language: lang }).catch(() => {});
    }
  }, [user]);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const dict = DICTIONARIES[language] ?? DICTIONARIES.en;
    let str = dict[key] ?? DICTIONARIES.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
