'use client';

import { useEffect, useState } from 'react';
import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_TERMS } from '@/lib/legalDefaults';
import { LegalPage } from '@/components/ui/LegalPage';

export default function TermsPage() {
  const [text, setText] = useState(DEFAULT_TERMS);
  const [appName, setAppName] = useState('Warfare Fitness');

  useEffect(() => {
    getSystemConfig()
      .then((cfg) => {
        if (cfg?.termsText) setText(cfg.termsText as string);
        if (cfg?.appName) setAppName(cfg.appName as string);
      })
      .catch(() => {});
  }, []);

  return (
    <LegalPage
      eyebrow="Legal · Members"
      title="Terms & Conditions"
      text={text}
      backHref="/"
      backLabel={`Back to ${appName}`}
    />
  );
}
