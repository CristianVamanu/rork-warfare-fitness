'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Heart, MessageCircle, Send, Image as ImageIcon, X, Clock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  getChannels, getChannelPosts, createChannelPost,
  likeChannelPost, getPostReplies, createReply, getUserLastPostInChannel,
} from '@/lib/firestore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Channel, ChannelPost } from '@/types';

function timeAgo(ts: unknown): string {
  if (!ts) return 'just now';
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function PostCard({
  post, userId, channelId, photoEnabled,
  onLike, onReply,
}: {
  post: ChannelPost; userId: string; channelId: string; photoEnabled: boolean;
  onLike: (post: ChannelPost) => void;
  onReply: (post: ChannelPost) => void;
}) {
  const [replies, setReplies] = useState<ChannelPost[]>([]);
  const [showReplies, setShowReplies] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const liked = post.likes.includes(userId);

  const handleShowReplies = async () => {
    if (showReplies) { setShowReplies(false); return; }
    setShowReplies(true);
    if (replies.length === 0 && post.replyCount > 0) {
      setLoadingReplies(true);
      try { setReplies(await getPostReplies(channelId, post.id)); }
      catch { /* noop */ }
      finally { setLoadingReplies(false); }
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={post.userDisplayName} src={post.userPhotoURL} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{post.userDisplayName}</p>
          <p className="text-xs text-text-tertiary">{timeAgo(post.createdAt)}</p>
        </div>
      </div>
      <p className="text-sm text-white leading-relaxed">{post.content}</p>
      {post.imageURL && (
        <img src={post.imageURL} alt="post" className="mt-3 rounded-xl w-full object-cover max-h-64" />
      )}
      <div className="flex items-center gap-4 mt-4">
        <button
          onClick={() => onLike(post)}
          className={`flex items-center gap-1.5 text-xs transition-colors ${liked ? 'text-danger' : 'text-text-secondary hover:text-danger'}`}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
          {post.likes.length}
        </button>
        <button
          onClick={handleShowReplies}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-white transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
        </button>
        <button
          onClick={() => onReply(post)}
          className="text-xs text-accent hover:underline ml-auto"
        >
          Reply
        </button>
      </div>
      {showReplies && (
        <div className="mt-3 pt-3 border-t border-white/8 space-y-3 pl-4">
          {loadingReplies ? (
            <Skeleton className="h-12 rounded-xl" />
          ) : replies.length === 0 ? (
            <p className="text-xs text-text-tertiary">No replies yet.</p>
          ) : replies.map((r) => (
            <div key={r.id} className="flex items-start gap-2">
              <Avatar name={r.userDisplayName} src={r.userPhotoURL} size="sm" />
              <div className="flex-1 bg-surface-elevated rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-white">{r.userDisplayName}</p>
                  <span className="text-xs text-text-tertiary">{timeAgo(r.createdAt)}</span>
                </div>
                <p className="text-sm text-white mt-0.5">{r.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ChannelPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, trainerId } = useAuth();
  const channelId = typeof params.channelId === 'string' ? params.channelId : '';

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [slowModeBlocked, setSlowModeBlocked] = useState<Date | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChannelPost | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!channelId) return;
    Promise.all([
      getChannels(trainerId ?? undefined),
      getChannelPosts(channelId),
      user ? getUserLastPostInChannel(channelId, user.uid) : Promise.resolve(null),
    ]).then(([chs, ps, lastPost]) => {
      const ch = chs.find(c => c.id === channelId) ?? null;
      setChannel(ch);
      setPosts(ps);
      if (ch && ch.slowModeDays > 0 && lastPost) {
        const unlocksAt = new Date(lastPost.getTime() + ch.slowModeDays * 86400000);
        if (unlocksAt > new Date()) setSlowModeBlocked(unlocksAt);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [channelId, trainerId, user]);

  async function handlePost() {
    if (!user || !profile || !text.trim() || !channelId) return;
    if (slowModeBlocked && slowModeBlocked > new Date()) {
      toast.error(`Slow mode active. You can post again on ${slowModeBlocked.toLocaleDateString()}`);
      return;
    }
    setPosting(true);
    try {
      await createChannelPost(channelId, {
        userId: user.uid,
        userDisplayName: profile.displayName || 'Athlete',
        ...(profile.photoURL ? { userPhotoURL: profile.photoURL } : {}),
        content: text.trim(),
      });
      setText('');
      const updated = await getChannelPosts(channelId);
      setPosts(updated);
      // update slow mode lock
      if (channel && channel.slowModeDays > 0) {
        const unlocksAt = new Date(Date.now() + channel.slowModeDays * 86400000);
        setSlowModeBlocked(unlocksAt);
      }
      toast.success('Posted!');
    } catch { toast.error('Failed to post'); }
    finally { setPosting(false); }
  }

  async function handleLike(post: ChannelPost) {
    if (!user) return;
    const liked = post.likes.includes(user.uid);
    setPosts(prev => prev.map(p => p.id === post.id
      ? { ...p, likes: liked ? p.likes.filter(id => id !== user.uid) : [...p.likes, user.uid] }
      : p
    ));
    await likeChannelPost(channelId, post.id, user.uid, !liked).catch(() => {});
  }

  async function handleReply() {
    if (!user || !profile || !replyTarget || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await createReply(channelId, replyTarget.id, {
        userId: user.uid,
        userDisplayName: profile.displayName || 'Athlete',
        ...(profile.photoURL ? { userPhotoURL: profile.photoURL } : {}),
        content: replyText.trim(),
      });
      setPosts(prev => prev.map(p => p.id === replyTarget.id ? { ...p, replyCount: p.replyCount + 1 } : p));
      setReplyText('');
      setReplyTarget(null);
      toast.success('Reply sent!');
    } catch { toast.error('Failed to reply'); }
    finally { setSendingReply(false); }
  }

  if (loading) {
    return (
      <div>
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/8">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => router.back()} className="p-2 rounded-xl text-text-secondary">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <Skeleton className="h-5 w-32 rounded-lg" />
          </div>
        </div>
        <div className="px-4 py-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div>
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/8">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => router.back()} className="p-2 rounded-xl text-text-secondary"><ChevronLeft className="w-5 h-5" /></button>
            <p className="text-white font-bold">Channel not found</p>
          </div>
        </div>
      </div>
    );
  }

  const isBlocked = !!slowModeBlocked && slowModeBlocked > new Date();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/8">
        <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          <button onClick={() => router.back()} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xl">{channel.emoji || '#'}</span>
            <div>
              <p className="text-sm font-bold text-white">{channel.name}</p>
              {channel.slowModeDays > 0 && (
                <p className="text-xs text-text-tertiary flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {channel.slowModeDays}-day slow mode
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-36">
        {posts.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-2xl mb-2">💬</p>
            <p className="text-white font-bold">No posts yet</p>
            <p className="text-text-secondary text-sm mt-1">Be the first to post!</p>
          </Card>
        ) : posts.map((post, i) => (
          <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <PostCard
              post={post}
              userId={user?.uid ?? ''}
              channelId={channelId}
              photoEnabled={channel.photoUploadEnabled}
              onLike={handleLike}
              onReply={setReplyTarget}
            />
          </motion.div>
        ))}
      </div>

      {/* Reply modal */}
      <AnimatePresence>
        {replyTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 flex items-end"
            onClick={() => setReplyTarget(null)}
          >
            <motion.div
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="w-full bg-surface rounded-t-2xl p-4 space-y-3"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-white">Reply to {replyTarget.userDisplayName}</p>
                <button onClick={() => setReplyTarget(null)} className="text-text-secondary hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-text-secondary line-clamp-2 bg-surface-elevated rounded-lg px-3 py-2">
                {replyTarget.content}
              </p>
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Write a reply…"
                  rows={2}
                  className="flex-1 bg-surface-elevated border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary resize-none focus:outline-none focus:border-accent/50"
                />
                <Button onClick={handleReply} loading={sendingReply} disabled={!replyText.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compose box — fixed at bottom */}
      <div className="fixed bottom-16 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-white/8 px-4 py-3 z-20">
        <div className="max-w-lg mx-auto">
          {isBlocked && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 mb-2 bg-yellow-400/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Slow mode: next post available {slowModeBlocked!.toLocaleDateString()}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={isBlocked ? 'Slow mode active…' : 'Share something…'}
              disabled={isBlocked}
              rows={1}
              className="flex-1 bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary resize-none focus:outline-none focus:border-accent/50 disabled:opacity-40"
              style={{ maxHeight: 96, overflowY: 'auto' }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 96) + 'px';
              }}
            />
            {channel.photoUploadEnabled && !isBlocked && (
              <button className="p-2.5 rounded-xl bg-surface border border-white/10 text-text-secondary hover:text-white transition-colors">
                <ImageIcon className="w-5 h-5" />
              </button>
            )}
            <Button onClick={handlePost} loading={posting} disabled={!text.trim() || isBlocked}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
