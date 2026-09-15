'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, Send, MessageCircle, ArrowUpRight, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useHeaderData } from '@/contexts/HeaderDataContext';
import {
  subscribeAdminConversations, subscribeUserConversations, subscribeMessages,
  sendMessage, markConversationRead, deleteConversation,
} from '@/lib/firestore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Conversation, Message } from '@/types';

/**
 * The chat panel behind the header bubble.
 *
 * Slides over whatever screen is open instead of navigating to one. The
 * bubble used to send an admin to the admin panel's Messages tab and a
 * member to /messages, so answering a two-line question meant leaving a
 * workout or a dashboard and finding the way back. Staff see their inbox
 * and open a thread; a member has exactly one thread and lands in it.
 *
 * Subscriptions run only while the panel is open. The header keeps its own
 * unread-only listeners; nothing here is needed for the badge.
 */
function whenLabel(v: unknown): string {
  const ms = (v as { toMillis?: () => number } | null)?.toMillis?.();
  if (!ms) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function ChatDrawer() {
  const { user, profile } = useAuth();
  const { chatOpen, closeChat } = useHeaderData();
  const isAdmin = profile?.role === 'admin';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Which conversation is being asked about; deletion is confirmed inside
  // the panel rather than with a browser dialog, which on a phone sits on
  // top of the panel looking like a system error.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Lock the page behind the panel, and close on Escape.
  useEffect(() => {
    if (!chatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeChat(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [chatOpen, closeChat]);

  useEffect(() => {
    if (!chatOpen || !user) { setConversations([]); setLoading(true); return; }
    const onUpdate = (convs: Conversation[]) => { setConversations(convs); setLoading(false); };
    return isAdmin
      ? subscribeAdminConversations(user.uid, onUpdate)
      : subscribeUserConversations(user.uid, onUpdate);
  }, [chatOpen, user, isAdmin]);

  // A member has one thread — open it straight away.
  useEffect(() => {
    if (!isAdmin && !activeId && conversations.length === 1) setActiveId(conversations[0].id);
  }, [isAdmin, activeId, conversations]);

  useEffect(() => {
    if (!chatOpen) { setActiveId(null); setConfirmId(null); }
  }, [chatOpen]);

  useEffect(() => {
    if (!activeId || !chatOpen) { setMessages([]); return; }
    setMsgLoading(true);
    const unsub = subscribeMessages(activeId, (msgs) => {
      setMessages(msgs);
      setMsgLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 30);
    });
    setTimeout(() => inputRef.current?.focus(), 50);
    return unsub;
  }, [activeId, chatOpen]);

  // Mark read from the live list, so a reply arriving while the thread is
  // open clears too.
  useEffect(() => {
    if (!active) return;
    const unread = isAdmin ? active.unreadByAdmin : active.unreadByUser;
    if (unread) markConversationRead(active.id, isAdmin).catch(() => {});
  }, [active, isAdmin]);

  async function handleSend() {
    if (!active || !text.trim() || !user || !profile) return;
    const body = text.trim();
    setText('');
    setSending(true);
    try {
      await sendMessage(active.id, user.uid, profile.displayName, body, isAdmin);
    } catch {
      toast.error('Failed to send');
      setText(body);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!confirmId) return;
    setDeleting(true);
    try {
      await deleteConversation(confirmId);
      setConversations((prev) => prev.filter((c) => c.id !== confirmId));
      if (activeId === confirmId) setActiveId(null);
      setConfirmId(null);
      toast.success('Conversation deleted');
      // A member has nothing left to look at once their one thread is gone.
      if (!isAdmin) closeChat();
    } catch {
      toast.error('Failed to delete conversation');
    } finally {
      setDeleting(false);
    }
  }

  const confirmTarget = conversations.find((c) => c.id === confirmId) ?? null;

  const inboxHref = isAdmin ? '/admin?tab=messages' : '/messages';
  const headerTitle = active ? (isAdmin ? active.userDisplayName || 'Member' : 'Your coach') : 'Messages';

  return (
    <AnimatePresence>
      {chatOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeChat}
            style={{ backgroundColor: 'var(--overlay)' }}
            className="fixed inset-0 z-50 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Messages"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            className="chat-bg fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] border-l border-border flex flex-col"
          >
            <div className="flex items-center gap-2 px-3 h-14 border-b border-border flex-shrink-0 bg-black/30 backdrop-blur-md">
              {active && isAdmin && (
                <button
                  onClick={() => setActiveId(null)}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-foreground hover:bg-white/5"
                  aria-label="Back to inbox"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-foreground truncate">{headerTitle}</p>
                {active && isAdmin && active.userEmail && (
                  <p className="text-[11px] text-text-tertiary truncate">{active.userEmail}</p>
                )}
              </div>
              {active && (
                <button
                  onClick={() => setConfirmId(active.id)}
                  className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors"
                  aria-label="Delete conversation"
                  title="Delete conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <Link
                href={inboxHref}
                onClick={closeChat}
                className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-text-tertiary hover:text-foreground px-2 py-1 rounded-lg"
                title="Open the full inbox"
              >
                Full inbox <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={closeChat}
                className="p-1.5 rounded-lg text-text-secondary hover:text-foreground hover:bg-white/5"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {active ? (
              <>
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-2">
                  {msgLoading ? (
                    <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-text-tertiary text-sm py-10">No messages yet.</p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderId === user?.uid;
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                            mine ? 'bg-accent text-black' : 'bg-surface-elevated/90 backdrop-blur-sm border border-border text-foreground'
                          }`}>
                            {m.content}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>
                <div className="chat-composer flex gap-2 px-3 pt-3 border-t border-border flex-shrink-0 bg-black/30 backdrop-blur-md">
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Write a message…"
                    className="flex-1 min-w-0 bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                  />
                  <Button onClick={handleSend} loading={sending} disabled={!text.trim()} aria-label="Send">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto overscroll-contain">
                {loading ? (
                  <div className="p-3 space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                    <MessageCircle className="w-8 h-8 text-text-tertiary" />
                    <p className="text-sm text-text-secondary">
                      {isAdmin ? 'No conversations yet. Start one from a member in Clients.' : 'No messages yet.'}
                    </p>
                  </div>
                ) : (
                  <ul className="p-3 space-y-2">
                    {conversations.map((c) => {
                      const unread = isAdmin ? c.unreadByAdmin : c.unreadByUser;
                      return (
                        <li
                          key={c.id}
                          className={`flex items-center rounded-2xl border backdrop-blur-sm transition-colors ${
                            unread
                              ? 'bg-accent/[0.08] border-accent/30'
                              : 'bg-surface-elevated/70 border-border hover:border-white/15'
                          }`}
                        >
                          <button
                            onClick={() => setActiveId(c.id)}
                            className="flex-1 min-w-0 flex items-center gap-3 pl-3 pr-2 py-3 text-left"
                          >
                            <Avatar name={isAdmin ? c.userDisplayName : 'Coach'} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`text-sm truncate flex-1 ${unread ? 'font-bold text-foreground' : 'font-semibold text-foreground'}`}>
                                  {isAdmin ? c.userDisplayName || 'Member' : 'Your coach'}
                                </p>
                                <span className={`text-[11px] flex-shrink-0 ${unread ? 'text-accent font-semibold' : 'text-text-tertiary'}`}>
                                  {whenLabel(c.lastMessageAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className={`text-xs truncate flex-1 ${unread ? 'text-foreground/85' : 'text-text-tertiary'}`}>
                                  {c.lastMessage || 'No messages yet'}
                                </p>
                                {unread && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={() => setConfirmId(c.id)}
                            className="p-2 mr-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0"
                            aria-label="Delete conversation"
                            title="Delete conversation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <AnimatePresence>
              {confirmTarget && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                  onClick={() => !deleting && setConfirmId(null)}
                >
                  <motion.div
                    role="alertdialog"
                    aria-label="Delete conversation"
                    initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-2xl border border-border bg-surface-elevated p-5 shadow-2xl"
                  >
                    <div className="w-10 h-10 rounded-full bg-danger/15 text-danger flex items-center justify-center mb-3">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <p className="text-[15px] font-bold text-foreground">Delete this conversation?</p>
                    <p className="text-sm text-text-secondary mt-1">
                      {isAdmin
                        ? `Every message with ${confirmTarget.userDisplayName || 'this member'} is removed for both of you. This cannot be undone.`
                        : 'Every message with your coach is removed for both of you. This cannot be undone.'}
                    </p>
                    <div className="flex gap-2 mt-4">
                      <Button variant="secondary" fullWidth onClick={() => setConfirmId(null)} disabled={deleting}>
                        Keep
                      </Button>
                      <Button variant="danger" fullWidth onClick={handleDelete} loading={deleting}>
                        Delete
                      </Button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
