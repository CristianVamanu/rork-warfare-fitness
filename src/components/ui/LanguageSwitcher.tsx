'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import { useLanguage, LANGUAGE_LABELS, type Language } from '@/contexts/LanguageContext';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
      >
        <Globe className="w-3.5 h-3.5" />
        {LANGUAGE_LABELS[language]}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-36 bg-surface-elevated border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
          {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
            <button
              key={lang}
              onClick={() => { setLanguage(lang); setOpen(false); }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-white hover:bg-white/5 transition-colors text-left"
            >
              {LANGUAGE_LABELS[lang]}
              {language === lang && <Check className="w-3.5 h-3.5 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
