'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { LifeBuoy, Send, ChevronLeft, Plus, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeUserSupportTickets,
  subscribeSupportMessages,
  createSupportTicket,
  sendSupportMessage,
  markSupportTicketRead,
} from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  useSupportUpload,
  AttachButton,
  PendingAttachment,
  MessageAttachment,
} from '@/components/support/SupportAttachment';
import type { SupportTicket, SupportTicketStatus, Message } from '@/types';

const STATUS_STYLES: Record<SupportTicketStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-400/10 text-yellow-400' },
  ongoing: { label: 'Ongoing', className: 'bg-accent/10 text-accent' },
  resolved: { label: 'Resolved', className: 'bg-success/10 text-success' },
};

function StatusPill({ status }: { status: SupportTicketStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full whitespace-nowrap ${s.className}`}>
      {s.label}
    </span>
  );
}

export default function SupportPage() {
  const { user, profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [creating, setCreating] = useState(false);

  // Staged files — held locally and only uploaded on send, so cancelling the
  // composer never leaves an orphaned object in the bucket.
  const [newTicketFile, setNewTicketFile] = useState<File | null>(null);
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const { upload, uploading, progress } = useSupportUpload();

  const endRef = useRef<HTMLDivElement>(null);

  // Read off the live list rather than held in its own state, so a status
  // change made by an admin while the member has the thread open takes effect
  // immediately — including locking the composer the moment it's resolved.
  const activeTicket = tickets.find((t) => t.id === activeId) ?? null;
  const isResolved = activeTicket?.status === 'resolved';

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = subscribeUserSupportTickets(user.uid, (list) => {
      setTickets(list);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    setMsgLoading(true);
    const unsub = subscribeSupportMessages(activeId, (msgs) => {
      setMessages(msgs);
      setMsgLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return unsub;
  }, [activeId]);

  function openTicket(t: SupportTicket) {
    setActiveId(t.id);
    if (t.unreadByUser) markSupportTicketRead(t.id, false).catch(() => {});
  }

  async function handleCreate() {
    if (!user || !profile || !subject.trim() || !body.trim()) return;
    setCreating(true);
    try {
      // Upload first: if the attachment fails, the member still has their
      // typed request in front of them rather than a ticket that silently
      // lost the screenshot they were trying to send.
      let attachment = null;
      if (newTicketFile) {
        attachment = await upload(user, newTicketFile);
        if (!attachment) { setCreating(false); return; }
      }
      const id = await createSupportTicket(
        user.uid,
        profile.displayName || 'Member',
        profile.email || '',
        subject.trim(),
        body.trim(),
        attachment
      );
      setComposerOpen(false);
      setSubject('');
      setBody('');
      setNewTicketFile(null);
      setActiveId(id);
      toast.success('Support request sent');
    } catch {
      toast.error('Could not send your request. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSend() {
    if (!activeTicket || !user || !profile || isResolved) return;
    // An attachment on its own is a valid message — a screenshot often says
    // more than the sentence someone would have typed next to it.
    if (!msgText.trim() && !replyFile) return;
    setSending(true);
    const text = msgText.trim();
    const file = replyFile;
    setMsgText('');
    setReplyFile(null);
    try {
      let attachment = null;
      if (file) {
        attachment = await upload(user, file);
        if (!attachment) { setMsgText(text); setReplyFile(file); setSending(false); return; }
      }
      await sendSupportMessage(activeTicket.id, user.uid, profile.displayName || 'Member', text, false, attachment);
    } catch {
      // The rules reject a send on a resolved ticket, so this is also the
      // path taken if support closed the thread a moment before this send.
      toast.error('Could not send. This request may have been resolved.');
      setMsgText(text);
      setReplyFile(file);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <Header title="Support" showBack />
      <div className="px-4 py-4">
        {activeTicket ? (
          <div className="flex flex-col h-[75vh]">
            <div className="flex items-center gap-3 pb-3 border-b border-white/8 mb-3">
              <button
                onClick={() => setActiveId(null)}
                aria-label="Back to all requests"
                className="p-1.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white truncate">{activeTicket.subject}</p>
                  <StatusPill status={activeTicket.status} />
                </div>
                <p className="text-xs text-text-secondary">Support usually replies within a day</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {msgLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.isFromAdmin ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${m.isFromAdmin ? 'bg-surface-elevated text-white' : 'bg-accent text-black'}`}>
                      {m.isFromAdmin && (
                        <p className="text-[10px] font-bold uppercase tracking-wide text-accent mb-0.5">Support</p>
                      )}
                      {m.content && <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>}
                      <MessageAttachment message={m} />
                    </div>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>

            {isResolved ? (
              <div className="mt-3 pt-3 border-t border-white/8">
                <div className="flex items-start gap-2.5 rounded-xl bg-success/8 border border-success/25 px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-white">This request is resolved</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      You can still read the whole conversation. If you need more help, open a new request.
                    </p>
                  </div>
                </div>
                <Button fullWidth variant="secondary" className="mt-3" onClick={() => { setActiveId(null); setComposerOpen(true); }}>
                  <Plus className="w-4 h-4" /> New Request
                </Button>
              </div>
            ) : (
              <div className="pt-3 border-t border-white/8 mt-3 space-y-2">
                {replyFile && (
                  <PendingAttachment
                    file={replyFile}
                    uploading={uploading}
                    progress={progress}
                    onClear={() => setReplyFile(null)}
                  />
                )}
                <div className="flex gap-2">
                  <AttachButton onPick={setReplyFile} disabled={sending || uploading} />
                  <input
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Write a message…"
                    aria-label="Message"
                    className="flex-1 min-w-0 bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                  />
                  <Button onClick={handleSend} loading={sending || uploading} disabled={!msgText.trim() && !replyFile}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Button fullWidth onClick={() => setComposerOpen(true)}>
              <Plus className="w-4 h-4" /> New Support Request
            </Button>

            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
            ) : tickets.length === 0 ? (
              <Card className="p-8 text-center">
                <LifeBuoy className="w-8 h-8 text-text-tertiary mx-auto mb-3" aria-hidden="true" />
                <p className="text-sm font-medium text-white">No support requests yet</p>
                <p className="text-xs text-text-secondary mt-1">
                  Stuck on something, or hit a bug? Open a request and we&apos;ll pick it up.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {tickets.map((t) => (
                  <Card
                    key={t.id}
                    onClick={() => openTicket(t)}
                    className={`p-4 cursor-pointer hover:bg-white/5 transition-colors ${t.unreadByUser ? 'border-accent/40' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent flex-shrink-0">
                        <LifeBuoy className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{t.subject}</p>
                          {t.unreadByUser && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                        </div>
                        <p className="text-xs text-text-secondary truncate">{t.lastMessage}</p>
                      </div>
                      <StatusPill status={t.status} />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="New Support Request"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 min-w-0" onClick={() => { setComposerOpen(false); setNewTicketFile(null); }}>
              Cancel
            </Button>
            <Button
              className="flex-1 min-w-0"
              loading={creating || uploading}
              disabled={!subject.trim() || !body.trim()}
              onClick={handleCreate}
            >
              Send
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="support-subject" className="text-sm font-medium text-text-secondary">What&apos;s it about?</label>
            <input
              id="support-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              placeholder="e.g. My subscription didn't activate"
              style={{ backgroundColor: 'var(--surface-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--foreground)' }}
              className="w-full border rounded-xl px-4 py-3 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="support-body" className="text-sm font-medium text-text-secondary">Tell us what happened</label>
            <textarea
              id="support-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              rows={5}
              placeholder="The more detail you give us, the faster we can fix it."
              style={{ backgroundColor: 'var(--surface-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--foreground)' }}
              className="w-full border rounded-xl px-4 py-3 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 transition-all resize-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <AttachButton onPick={setNewTicketFile} disabled={creating || uploading} />
              <p className="text-xs text-text-tertiary">
                Attach a screenshot or screen recording — optional, up to 20MB.
              </p>
            </div>
            {newTicketFile && (
              <PendingAttachment
                file={newTicketFile}
                uploading={uploading}
                progress={progress}
                onClear={() => setNewTicketFile(null)}
              />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
