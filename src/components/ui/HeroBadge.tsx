/**
 * Gold "Hero" badge for members on the yearly Hero plan. Shown next to their
 * name on their profile and on their community posts and replies.
 */
import { Crown } from 'lucide-react';

/** True when the member's active plan is the Hero (yearly) plan. */
export function isHeroMember(p: { membership?: { status?: string; planName?: string } } | null | undefined): boolean {
  return p?.membership?.status === 'active' && /hero/i.test(p.membership.planName ?? '');
}

export function HeroBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const md = size === 'md';
  return (
    <span title="Hero member" className={`wf-dark inline-flex items-center gap-1 rounded-full font-black uppercase tracking-wide text-black align-middle ${md ? 'px-2.5 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[9px]'}`}
      style={{ background: 'linear-gradient(180deg, #FFD978, #F5A623)', boxShadow: '0 0 10px rgba(245,166,35,0.55)' }}>
      <Crown className={md ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} strokeWidth={2.6} /> Hero
    </span>
  );
}
