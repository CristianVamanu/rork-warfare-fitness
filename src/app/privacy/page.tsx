'use client';

import { useEffect, useState } from 'react';
import { getSystemConfig } from '@/lib/firestore';
import { DEFAULT_PRIVACY_POLICY, MOBILE_PRIVACY_SECTIONS, hasMobilePrivacySections } from '@/lib/legalDefaults';
import { LegalPage } from '@/components/ui/LegalPage';

export default function PrivacyPage() {
  const [text, setText] = useState(DEFAULT_PRIVACY_POLICY);
  const [appName, setAppName] = useState('Warfare Fitness');

  useEffect(() => {
    getSystemConfig()
      .then((cfg) => {
        if (cfg?.privacyPolicyText) {
          // An admin-edited policy from before the mobile apps still has to
          // disclose what the apps read; append the sections if missing.
          const t = cfg.privacyPolicyText as string;
          setText(hasMobilePrivacySections(t) ? t : `${t}\n\n${MOBILE_PRIVACY_SECTIONS}`);
        }
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
