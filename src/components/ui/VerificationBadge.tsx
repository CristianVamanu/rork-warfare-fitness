import { BadgeCheck } from 'lucide-react';
import type { VerificationLevel } from '@/types';

export function VerificationBadge({ level, showLabel = false }: { level: VerificationLevel; showLabel?: boolean }) {
  if (level !== 'verified') {
    if (!showLabel) return null;
    return <span className="text-[10px] text-text-tertiary flex-shrink-0">Unverified</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0 text-accent" title="Verified lift — approved by an admin/trainer">
      <BadgeCheck className="w-3.5 h-3.5" />
      {showLabel && <span className="text-[10px] font-medium">Verified</span>}
    </span>
  );
}
