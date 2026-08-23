'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, ChevronLeft, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeUserConversations, subscribeMessages, sendMessage, markConversationRead, deleteConversation, startSupportConversation, getSystemConfig } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Conversation, Message } from '@/types';

export default function MessagesPage() {
  const { user, profile, trainerId } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  // trainerId on the account's own doc is resolved once at signup — an
  // account created before that field existed, or before system/config's
  // own trainerId was ever set (e.g. a pre-existing admin/install), can
  // have it permanently missing with no way to backfill itself. Falling
  // back to reading system/config directly (publicly readable, same value
  // signup would have resolved anyway) means "Message Support" isn't
  // silently unavailable just because of stale account data.
  const [fallbackTrainerId, setFallbackTrainerId] = useState<string | null>(null);
  const effectiveTrainerId = trainerId || fallbackTrainerId;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trainerId) return;
    getSystemConfig().then((cfg) => setFallbackTrainerId((cfg?.trainerId as string) || null)).catch(() => {});
  }, [trainerId]);
  // A real 1:1 Coaching client actually has a dedicated human coach on the
  // other end of this same conversation system — "Support" (the default,
  // self-serve framing for everyone else) would be a downgrade for them.
  const isCoachingClient = profile?.coaching?.status === 'active';
  const conversationLabel = isCoachingClient ? 'Your Coach' : 'Support';

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = subscribeUserConversations(user.uid, (convs) => {
      setConversations(convs);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Live messages for whichever conversation is open — a coach's reply now
  // appears as it's sent instead of only showing up after leaving and
  // reopening the thread.
  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    setMsgLoading(true);
    const unsub = subscribeMessages(activeConv.id, (msgs) => {
      setMessages(msgs);
      setMsgLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return unsub;
  }, [activeConv?.id]);

  async function handleStartConversation() {
    if (!user || !profile || !effectiveTrainerId || starting) return;
    setStarting(true);
    try {
      const convId = await startSupportConversation(user.uid, effectiveTrainerId, profile.displayName, profile.email);
      // The live subscribeUserConversations listener above will also pick
      // this up, but opening it immediately avoids waiting on that
      // round-trip before the thread appears usable.
      setActiveConv({
        id: convId, adminId: effectiveTrainerId, userId: user.uid,
        userDisplayName: profile.displayName, userEmail: profile.email,
        lastMessage: '', lastMessageAt: null, createdAt: null,
        unreadByUser: false, unreadByAdmin: true,
      });
    } catch {
      toast.error('Failed to start conversation');
    } finally {
      setStarting(false);
    }
  }

  function openConversation(conv: Conversation) {
    setActiveConv(conv);
    if (conv.unreadByUser) markConversationRead(conv.id, false).catch(() => {});
  }

  async function handleDelete(conv: Conversation) {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await deleteConversation(conv.id);
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      if (activeConv?.id === conv.id) setActiveConv(null);
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete conversation');
    }
  }

  async function handleSend() {
    if (!activeConv || !msgText.trim() || !user || !profile) return;
    setSending(true);
    const text = msgText.trim();
    setMsgText('');
    try {
      // No manual refetch/patch needed — the live subscriptions above pick
      // up this write's effect on both the messages subcollection and the
      // conversation doc's lastMessage automatically.
      await sendMessage(activeConv.id, user.uid, profile.displayName, text, false);
    } catch {
      toast.error('Failed to send');
      setMsgText(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <Header title="Messages" />
      <div className="px-4 py-4">
        {activeConv ? (
          <div className="flex flex-col h-[75vh]">
            <div className="flex items-center gap-3 pb-3 border-b border-white/8 mb-3">
              <button onClick={() => setActiveConv(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">{conversationLabel}</p>
                <p className="text-xs text-text-secondary">Replies may take a moment</p>
              </div>
              <button
                onClick={() => handleDelete(activeConv)}
                title="Delete conversation"
                className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {msgLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
              ) : messages.length === 0 ? (
                <p className="text-center text-text-tertiary text-sm py-8">No messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.isFromAdmin ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${m.isFromAdmin ? 'bg-surface-elevated text-white' : 'bg-accent text-black'}`}>
                      <p className="text-sm">{m.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="flex gap-2 pt-3 border-t border-white/8 mt-3">
              <input
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={isCoachingClient ? "Reply to your coach…" : "Reply…"}
                className="flex-1 bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
              />
              <Button onClick={handleSend} loading={sending} disabled={!msgText.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : conversations.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
            <MessageSquare className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
            <p className="text-white font-bold">No messages yet</p>
            <p className="text-text-secondary text-sm mt-1 mb-4">Have a question? Reach out and we&apos;ll get back to you.</p>
            {effectiveTrainerId && (
              <Button loading={starting} onClick={handleStartConversation}>
                Message {isCoachingClient ? 'Your Coach' : 'Support'}
              </Button>
            )}
          </motion.div>
        ) : (
          <div className="space-y-2">
            {effectiveTrainerId && (
              <Button variant="ghost" fullWidth loading={starting} onClick={handleStartConversation}>
                <MessageSquare className="w-3.5 h-3.5" /> New Message
              </Button>
            )}
            {conversations.map((conv) => (
              <motion.div key={conv.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Card
                  className={`p-4 hover:bg-white/5 transition-colors ${conv.unreadByUser ? 'border-accent/40' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center text-danger text-sm font-bold flex-shrink-0 cursor-pointer"
                      onClick={() => openConversation(conv)}
                    >
                      {isCoachingClient ? 'C' : 'S'}
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openConversation(conv)}>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{conversationLabel}</p>
                        {conv.unreadByUser && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-text-secondary truncate">{conv.lastMessage || 'No messages yet'}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(conv); }}
                      title="Delete conversation"
                      className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
