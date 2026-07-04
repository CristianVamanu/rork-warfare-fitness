'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Send, ChevronLeft, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getUserConversations, getMessages, sendMessage, markConversationRead, deleteConversation } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Conversation, Message } from '@/types';

export default function MessagesPage() {
  const { user, profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    getUserConversations(user.uid)
      .then(setConversations)
      .catch(() => toast.error('Failed to load messages'))
      .finally(() => setLoading(false));
  }, [user]);

  async function openConversation(conv: Conversation) {
    setActiveConv(conv);
    setMsgLoading(true);
    try {
      const msgs = await getMessages(conv.id);
      setMessages(msgs);
      if (conv.unreadByUser) await markConversationRead(conv.id, false);
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadByUser: false } : c));
    } catch {
      toast.error('Failed to load messages');
    } finally {
      setMsgLoading(false);
    }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
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
      await sendMessage(activeConv.id, user.uid, profile.displayName, text, false);
      const msgs = await getMessages(activeConv.id);
      setMessages(msgs);
      setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, lastMessage: text } : c));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
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
                <p className="text-sm font-bold text-white">Your Coach</p>
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
                placeholder="Reply to your coach…"
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
            <p className="text-text-secondary text-sm mt-1">Your coach will reach out to you here.</p>
          </motion.div>
        ) : (
          <div className="space-y-2">
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
                      C
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openConversation(conv)}>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">Your Coach</p>
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
