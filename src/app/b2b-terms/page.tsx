'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_B2B_TERMS } from '@/lib/legalDefaults';
import { LegalContent } from '@/components/ui/LegalContent';

export default function B2BTermsPage() {
  const [text, setText] = useState(DEFAULT_B2B_TERMS);
  const [appName, setAppName] = useState('Warfare Fitness');

  useEffect(() => {
    getSystemConfig()
      .then((cfg) => {
        if (cfg?.b2bTermsText) setText(cfg.b2bTermsText as string);
        if (cfg?.appName) setAppName(cfg.appName as string);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-12 max-w-2xl mx-auto">
      <Link href="/trainers" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-white transition-colors mb-6">
        <ChevronLeft className="w-4 h-4" /> Back to {appName} for Trainers
      </Link>
      <h1 className="text-2xl font-black text-white mb-6">B2B Terms & Conditions</h1>
      <LegalContent text={text} />
      <p className="text-text-tertiary text-xs pt-6 border-t border-white/10 mt-6">Last updated: {new Date().getFullYear()}</p>
    </div>
  );
}
