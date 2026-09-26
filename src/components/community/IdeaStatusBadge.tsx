import { IDEA_STATUS_LABEL, type IdeaStatus } from '@/types';

/**
 * The admin's verdict on a suggestion, as a small pill. One colour per
 * state so a board can be read at a glance: green is done, amber is in
 * hand, blue is promised, grey is a polite no.
 */
const STYLE: Record<IdeaStatus, string> = {
  planned: 'bg-info/15 text-info',
  building: 'bg-accent/15 text-accent',
  shipped: 'bg-success/15 text-success',
  declined: 'bg-white/8 text-text-tertiary',
};

export function IdeaStatusBadge({ status, className = '' }: { status: IdeaStatus | undefined; className?: string }) {
  if (!status || !(status in STYLE)) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${STYLE[status]} ${className}`}>
      {IDEA_STATUS_LABEL[status]}
    </span>
  );
}
