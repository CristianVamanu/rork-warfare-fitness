import type { VerificationLevel } from '@/types';

const CONFIG: Record<VerificationLevel, { dot: string; label: string }> = {
  unverified: { dot: 'bg-gray-400', label: 'Unverified' },
  trusted: { dot: 'bg-blue-400', label: 'Trusted Athlete' },
  video_verified: { dot: 'bg-purple-400', label: 'Video Verified' },
  coach_verified: { dot: 'bg-yellow-400', label: 'Coach Verified' },
  competition_verified: { dot: 'bg-accent', label: 'Competition Verified' },
};

export function VerificationBadge({ level, showLabel = false }: { level: VerificationLevel; showLabel?: boolean }) {
  const c = CONFIG[level] ?? CONFIG.unverified;
  if (level === 'unverified' && !showLabel) return null;
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0" title={c.label}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {showLabel && <span className="text-[10px] text-text-tertiary">{c.label}</span>}
    </span>
  );
}
