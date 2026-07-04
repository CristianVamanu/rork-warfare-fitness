'use client';

import { useEffect, useState } from 'react';
import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_TERMS } from '@/lib/legalDefaults';
import { LegalContent } from '@/components/ui/LegalContent';

export default function TermsPage() {
  const [text, setText] = useState(DEFAULT_TERMS);

  useEffect(() => {
    getSystemConfig()
      .then((cfg) => { if (cfg?.termsText) setText(cfg.termsText as string); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black text-white mb-6">Terms & Conditions</h1>
      <LegalContent text={text} />
      <p className="text-text-tertiary text-xs pt-6 border-t border-white/10 mt-6">Last updated: {new Date().getFullYear()}</p>
    </div>
  );
}
