'use client';

import { useEffect, useState } from 'react';
import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_PRIVACY_POLICY } from '@/lib/legalDefaults';
import { LegalPage } from '@/components/ui/LegalPage';

export default function PrivacyPage() {
  const [text, setText] = useState(DEFAULT_PRIVACY_POLICY);
  const [appName, setAppName] = useState('Warfare Fitness');

  useEffect(() => {
    getSystemConfig()
      .then((cfg) => {
        if (cfg?.privacyPolicyText) setText(cfg.privacyPolicyText as string);
        if (cfg?.appName) setAppName(cfg.appName as string);
      })
      .catch(() => {});
  }, []);

  return (
    <LegalPage
      eyebrow="Legal · Your data"
      title="Privacy Policy"
      text={text}
      backHref="/"
      backLabel={`Back to ${appName}`}
    />
  );
}
