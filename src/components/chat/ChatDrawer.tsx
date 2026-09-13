'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, Send, MessageCircle, ArrowUpRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useHeaderData } from '@/contexts/HeaderDataContext';
import {
  subscribeAdminConversations, subscribeUserConversations, subscribeMessages,
  sendMessage, markConversationRead,
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
    if (!chatOpen) setActiveId(null);
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
            style={{ boxShadow: 'var(--shadow-modal)', height: '100dvh' }}
            className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[420px] bg-surface-elevated border-l border-border flex flex-col"
          >
            <div className="flex items-center gap-2 px-3 h-14 border-b border-border flex-shrink-0">
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
                            mine ? 'bg-accent text-black' : 'bg-surface text-foreground'
                          }`}>
                            {m.content}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>
                <div
                  className="flex gap-2 px-3 pt-3 border-t border-border flex-shrink-0"
                  style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                >
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
                  <ul className="divide-y divide-border">
                    {conversations.map((c) => {
                      const unread = isAdmin ? c.unreadByAdmin : c.unreadByUser;
                      return (
                        <li key={c.id}>
                          <button
                            onClick={() => setActiveId(c.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                          >
                            <Avatar name={isAdmin ? c.userDisplayName : 'Coach'} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`text-sm truncate ${unread ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                                  {isAdmin ? c.userDisplayName || 'Member' : 'Your coach'}
                                </p>
                                {unread && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                              </div>
                              <p className={`text-xs truncate ${unread ? 'text-text-secondary' : 'text-text-tertiary'}`}>
                                {c.lastMessage || 'No messages yet'}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
