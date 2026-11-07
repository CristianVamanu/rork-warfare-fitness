'use client';

/**
 * Report a post or reply, and/or block its author. One sheet for every
 * place members post (channels, replies, challenge chats, PR wall).
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Flag, Ban } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { REPORT_REASONS, reportContent, blockUser, type ReportReason, type ReportTarget } from '@/lib/moderation';

export interface ReportSubject {
  target: ReportTarget;
  authorId: string;
  authorName: string;
  excerpt: string;
}

export function ReportModal({ subject, onClose }: { subject: ReportSubject | null; onClose: () => void }) {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);

  const close = () => { setReason(null); setNote(''); setAlsoBlock(false); onClose(); };

  const submit = () => {
    if (!user || !subject || !reason) return;
    const s = subject, r = reason, n = note, b = alsoBlock;
    close();
    toast.success(b ? `Reported. You won't see ${s.authorName} any more.` : 'Thanks. Our team will review it.');
    reportContent({ target: s.target, reason: r, note: n, reporterId: user.uid, reportedUserId: s.authorId, reportedUserName: s.authorName, excerpt: s.excerpt })
      .catch(() => toast.error('Report not sent. Check your connection.'));
    if (b) blockUser(user.uid, s.authorId, s.authorName).catch(() => toast.error('Could not block. Try again.'));
  };

  const blockOnly = () => {
    if (!user || !subject) return;
    const s = subject;
    close();
    toast.success(`${s.authorName} is blocked. You won't see their posts.`);
    blockUser(user.uid, s.authorId, s.authorName).catch(() => toast.error('Could not block. Try again.'));
  };

  return (
    <Modal open={!!subject} onClose={close} title="Report or block">
      {subject && (
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">Why are you reporting this? Reports are private: {subject.authorName} won&apos;t know who sent it.</p>
          <div className="grid grid-cols-2 gap-2">
            {REPORT_REASONS.map((r) => (
              <button key={r.id} onClick={() => setReason(r.id)}
                className={`px-3 py-2.5 rounded-[14px] text-[13px] font-semibold text-left transition-colors ${reason === r.id ? 'wf-set-active text-white' : 'wf-glow text-text-secondary'}`}>
                {r.label}
              </button>
            ))}
          </div>
          {reason && (
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Anything else we should know? (optional)"
              className="w-full wf-glow rounded-[14px] px-3.5 py-2.5 text-sm text-white placeholder:text-text-tertiary resize-none focus:outline-none" />
          )}
          <label className="flex items-center gap-2.5 text-sm text-white cursor-pointer select-none">
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="w-4 h-4 accent-[rgb(var(--accent-rgb))]" />
            Also block {subject.authorName}
          </label>
          <Button fullWidth disabled={!reason} onClick={submit} className="wf-cta"><Flag className="w-4 h-4" /> Send report</Button>
          <Button fullWidth variant="ghost" onClick={blockOnly}><Ban className="w-4 h-4" /> Just block {subject.authorName}</Button>
        </div>
      )}
    </Modal>
  );
}
