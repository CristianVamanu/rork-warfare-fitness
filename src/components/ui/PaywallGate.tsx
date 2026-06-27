'use client';

import { useEffect, useState } from 'react';
import { Lock, Star } from 'lucide-react';
import { getMembershipConfig } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from './Card';
import type { MembershipConfig } from '@/types';

interface Props {
  feature?: string; // 'barcode' | 'nutrition-ai' | undefined (means fullLock check only)
  programId?: string;
  children: React.ReactNode;
}

export function PaywallGate({ feature, programId, children }: Props) {
  const { profile } = useAuth();
  const [config, setConfig] = useState<MembershipConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getMembershipConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const hasMembership = profile?.membership?.status === 'active';

  if (!config || !config.enabled || hasMembership) {
    return <>{children}</>;
  }

  const isLocked =
    config.fullLock ||
    (feature && config.lockedFeatures.includes(feature)) ||
    (programId && config.lockedProgramIds.includes(programId));

  if (!isLocked) return <>{children}</>;

  const price = config.fee > 0 ? `$${config.fee.toFixed(2)}/mo` : 'Premium';

  return (
    <div className="px-4 py-12 flex flex-col items-center justify-center min-h-[40vh]">
      <Card className="p-8 text-center max-w-sm w-full border-accent/30">
        <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-accent" />
        </div>
        <div className="flex items-center justify-center gap-1 mb-2">
          <Star className="w-4 h-4 text-accent" fill="currentColor" />
          <span className="text-xs font-bold text-accent uppercase tracking-wide">Premium Feature</span>
        </div>
        <h3 className="text-lg font-black text-white mb-2">Members Only</h3>
        <p className="text-text-secondary text-sm mb-4">
          This feature is available to active members. Contact your trainer to unlock access.
        </p>
        <div className="p-3 bg-surface-elevated rounded-xl">
          <p className="text-2xl font-black text-white">{price}</p>
          <p className="text-xs text-text-secondary mt-0.5">membership</p>
        </div>
        <p className="text-xs text-text-tertiary mt-4">
          Reach out to your coach to activate your membership.
        </p>
      </Card>
    </div>
  );
}
