'use client';

import { useEffect, useState } from 'react';
import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_PRIVACY_POLICY } from '@/lib/legalDefaults';
import { LegalContent } from '@/components/ui/LegalContent';

export default function PrivacyPage() {
  const [text, setText] = useState(DEFAULT_PRIVACY_POLICY);

  useEffect(() => {
    getSystemConfig()
      .then((cfg) => { if (cfg?.privacyPolicyText) setText(cfg.privacyPolicyText as string); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-black text-white mb-6">Privacy Policy</h1>
      <LegalContent text={text} />
      <p className="text-text-tertiary text-xs pt-6 border-t border-white/10 mt-6">Last updated: {new Date().getFullYear()}</p>
    </div>
  );
}
