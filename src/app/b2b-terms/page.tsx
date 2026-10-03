'use client';

import { useEffect, useState } from 'react';
import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_B2B_TERMS } from '@/lib/legalDefaults';
import { LegalPage } from '@/components/ui/LegalPage';

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
    <LegalPage
      eyebrow="Legal · Trainers"
      title="B2B Terms & Conditions"
      text={text}
      backHref="/trainers"
      backLabel={`Back to ${appName} for Trainers`}
      operator={false}
    />
  );
}
