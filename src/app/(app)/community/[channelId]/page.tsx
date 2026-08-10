'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Heart, MessageCircle, Send, Image as ImageIcon, X, Clock, AlertTriangle, Trash2, MoreHorizontal, Loader2, Pin, ChevronsDown, Megaphone } from 'lucide-react';
import { compressImage } from '@/lib/imageCompress';
import { uploadUserContent, type StorageProvider } from '@/lib/uploadVideo';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  getChannels, subscribeChannelPosts, createChannelPost, deleteChannelPost,
  likeChannelPost, getPostReplies, createReply, getUserLastPostInChannel,
  pinChannelPost, unpinChannelPost, getSystemConfig,
} from '@/lib/firestore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Channel, ChannelPost } from '@/types';

function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return isNaN(d.getTime()) ? null : d;
}

// Relative for anything recent ("2h ago"), falls back to an actual date
// once it's more than a week old — "8d ago" stops being a useful timestamp
// fast, but "Jul 3" (or "Jul 3, 2025" across a year boundary) doesn't.
function timeAgo(ts: unknown): string {
  const d = toDate(ts);
  if (!d) return 'just now';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

// Full precise timestamp for a hover tooltip, regardless of which format
// the visible label above is using.
function fullTimestamp(ts: unknown): string | undefined {
  const d = toDate(ts);
  return d?.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function PostCard({
  post, userId, isAdmin, channelId, pinnedPostId,
  onLike, onReply, onDelete, onPin,
}: {
  post: ChannelPost;
  userId: string;
  isAdmin: boolean;
  channelId: string;
  pinnedPostId?: string;
  onLike: (post: ChannelPost) => void;
  onReply: (post: ChannelPost) => void;
  onDelete: (post: ChannelPost) => void;
  onPin: (post: ChannelPost, pin: boolean) => void;
}) {
  const [replies, setReplies] = useState<ChannelPost[]>([]);
  const [showReplies, setShowReplies] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const liked = post.likes.includes(userId);
  const canDelete = isAdmin || post.userId === userId;
  const isPinned = pinnedPostId === post.id;

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
    <Card className={`p-4 ${isPinned ? 'border border-accent/40 bg-accent/5' : ''}`}>
      <div className="flex items-start gap-3 mb-3">
        <Avatar name={post.userDisplayName} src={post.userPhotoURL} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{post.userDisplayName}</p>
          <p className="text-xs text-text-tertiary" title={fullTimestamp(post.createdAt)}>{timeAgo(post.createdAt)}</p>
        </div>
        <div className="flex items-center gap-1">
          {isPinned && <Pin className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
          {(canDelete || isAdmin) && (
            <div className="relative">
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-white hover:bg-white/8 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-8 z-20 bg-surface-elevated border border-white/10 rounded-xl shadow-xl min-w-[140px]">
                    {isAdmin && (
                      <button
                        onClick={() => { setShowMenu(false); onPin(post, !isPinned); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:text-white hover:bg-white/8 transition-colors rounded-t-xl"
                      >
                        <Pin className="w-3.5 h-3.5" />
                        {isPinned ? 'Unpin' : 'Pin to top'}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => { setShowMenu(false); onDelete(post); }}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors ${isAdmin ? 'rounded-b-xl' : 'rounded-xl'}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{post.content}</p>
      {post.imageURL && (
        <img src={post.imageURL} alt="post" loading="lazy" decoding="async" className="mt-3 rounded-xl w-full object-cover max-h-64" />
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
                  <span className="text-xs text-text-tertiary" title={fullTimestamp(r.createdAt)}>{timeAgo(r.createdAt)}</span>
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
  const isAdmin = profile?.role === 'admin' || profile?.role === 'trainer';

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingImageURL, setPendingImageURL] = useState<string | null>(null);
  const [slowModeBlocked, setSlowModeBlocked] = useState<Date | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChannelPost | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const resumedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const postsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!channelId) return;
    Promise.all([
      getChannels(trainerId ?? undefined),
      user ? getUserLastPostInChannel(channelId, user.uid) : Promise.resolve(null),
    ]).then(([chs, lastPost]) => {
      const ch = chs.find(c => c.id === channelId) ?? null;
      setChannel(ch);
      if (ch && ch.slowModeDays > 0 && lastPost) {
        const unlocksAt = new Date(lastPost.getTime() + ch.slowModeDays * 86400000);
        if (unlocksAt > new Date()) setSlowModeBlocked(unlocksAt);
      }
    }).catch(() => {});

    // Live listener (not a one-shot fetch) — otherwise a user sitting in a
    // channel never sees a message someone else posts until they navigate
    // away and back.
    let firstSnapshot = true;
    const unsub = subscribeChannelPosts(
      channelId,
      (ps) => {
        setPosts(ps);
        if (firstSnapshot) { firstSnapshot = false; setLoading(false); }
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [channelId, trainerId, user]);

  // Resume where the user left off instead of always jumping to the very
  // bottom: the last post they had scrolled to is remembered per-channel in
  // localStorage. If there's nothing saved (first visit) or the saved post
  // has since been deleted, falls back to the old behavior (bottom/newest).
  const lastReadKey = `community_lastread_${channelId}`;
  useEffect(() => {
    if (loading || posts.length === 0 || resumedRef.current) return;
    resumedRef.current = true;
    const savedId = localStorage.getItem(lastReadKey);
    const idx = savedId ? posts.findIndex((p) => p.id === savedId) : -1;
    setTimeout(() => {
      if (idx !== -1 && idx < posts.length - 1) {
        document.getElementById(`post-${savedId}`)?.scrollIntoView({ behavior: 'instant', block: 'start' });
        setUnreadCount(posts.length - 1 - idx);
      } else {
        postsEndRef.current?.scrollIntoView({ behavior: 'instant' });
      }
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, posts.length]);

  // Show "Jump to latest" when user scrolls away from bottom, and keep
  // remembering the topmost visible post so a return visit can resume here.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    let saveTimer: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJumpToLatest(distanceFromBottom > 200);
      if (distanceFromBottom <= 200) setUnreadCount(0);

      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const containerTop = el.getBoundingClientRect().top;
        const postEls = el.querySelectorAll<HTMLElement>('[data-post-id]');
        for (const postEl of Array.from(postEls)) {
          if (postEl.getBoundingClientRect().top - containerTop >= -20) {
            localStorage.setItem(lastReadKey, postEl.dataset.postId!);
            break;
          }
        }
      }, 400);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => { el.removeEventListener('scroll', handleScroll); clearTimeout(saveTimer); };
  }, [loading, lastReadKey]);

  // Focus reply textarea when sheet opens
  useEffect(() => {
    if (replyTarget) {
      setTimeout(() => replyTextareaRef.current?.focus(), 100);
    }
  }, [replyTarget]);

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }
    setUploadingImage(true);
    try {
      const compressed = await compressImage(file);
      const cfg = await getSystemConfig().catch(() => null);
      const provider = (cfg?.storageProvider as StorageProvider) || 'firebase';
      const url = await uploadUserContent(provider, user, compressed, 'community');
      setPendingImageURL(url);
      toast.success('Image ready — tap send to post');
    } catch {
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handlePost() {
    if (!user || !profile || (!text.trim() && !pendingImageURL) || !channelId) return;
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
        ...(pendingImageURL ? { imageURL: pendingImageURL } : {}),
      });
      setText('');
      setPendingImageURL(null);
      if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
      // No follow-up getChannelPosts()/setPosts() here — the live
      // subscribeChannelPosts listener already picks up this post as soon
      // as Firestore commits it. Re-fetching separately used to throw
      // "Failed to post" on any transient network hiccup even though the
      // post itself had already gone through successfully.
      if (channel && channel.slowModeDays > 0) {
        setSlowModeBlocked(new Date(Date.now() + channel.slowModeDays * 86400000));
      }
      setTimeout(() => {
        postsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setShowJumpToLatest(false);
        setUnreadCount(0);
      }, 100);
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

  async function handleDelete(post: ChannelPost) {
    try {
      await deleteChannelPost(channelId, post.id);
      // If the pinned post was deleted, clear pinnedPostId from channel state
      if (channel?.pinnedPostId === post.id) {
        setChannel(prev => prev ? { ...prev, pinnedPostId: undefined } : prev);
      }
      toast.success('Post deleted');
    } catch {
      // The live subscribeChannelPosts listener is the source of truth for
      // `posts` now — a flaky connection can make deleteChannelPost's
      // promise reject even though the delete was already durably queued
      // and goes on to succeed server-side, which used to show "Failed to
      // delete" on a post that had, in fact, just been deleted. Only surface
      // the error if the post is still actually present a moment later.
      setTimeout(() => {
        setPosts(prev => {
          if (prev.some(p => p.id === post.id)) toast.error('Failed to delete');
          return prev;
        });
      }, 1500);
    }
  }

  async function handlePin(post: ChannelPost, pin: boolean) {
    try {
      if (pin) {
        await pinChannelPost(channelId, post.id);
        setChannel(prev => prev ? { ...prev, pinnedPostId: post.id } : prev);
        toast.success('Post pinned to top');
      } else {
        await unpinChannelPost(channelId, post.id);
        setChannel(prev => prev ? { ...prev, pinnedPostId: undefined } : prev);
        toast.success('Post unpinned');
      }
    } catch { toast.error('Failed to update pin'); }
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
      <div className="flex flex-col min-h-screen max-w-2xl mx-auto w-full">
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
      <div className="flex flex-col min-h-screen max-w-2xl mx-auto w-full">
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
  const canSend = (text.trim().length > 0 || !!pendingImageURL) && !isBlocked;
  const pinnedPost = channel.pinnedPostId ? posts.find(p => p.id === channel.pinnedPostId) : null;

  // Height of the compose box (approx) so the post list doesn't hide behind it
  const COMPOSE_HEIGHT = channel.photoUploadEnabled ? 68 : 60;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-white/8">
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto w-full">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xl flex-shrink-0">{channel.emoji || '#'}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{channel.name}</p>
              {channel.slowModeDays > 0 && (
                <p className="text-xs text-text-tertiary flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {channel.slowModeDays}-day slow mode
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Posts ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: `calc(${COMPOSE_HEIGHT + 64 + 16}px + env(safe-area-inset-bottom, 0px))` }}
      >
        <div className="px-4 py-4 space-y-3 max-w-2xl mx-auto w-full">
          {/* Pinned post banner */}
          {pinnedPost && (
            <div className="flex items-start gap-2 bg-accent/10 border border-accent/30 rounded-2xl px-3 py-3">
              <Pin className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-accent mb-1">Pinned message</p>
                <p className="text-sm text-white font-bold">{pinnedPost.userDisplayName}</p>
                <p className="text-sm text-text-secondary mt-0.5 whitespace-pre-wrap">{pinnedPost.content}</p>
                {pinnedPost.imageURL && (
                  <img src={pinnedPost.imageURL} alt="pinned" loading="lazy" decoding="async" className="mt-2 rounded-lg w-full object-cover max-h-32" />
                )}
              </div>
            </div>
          )}

          {posts.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-2xl mb-2">💬</p>
              <p className="text-white font-bold">No posts yet</p>
              <p className="text-text-secondary text-sm mt-1">Be the first to post!</p>
            </Card>
          ) : posts.map((post, i) => (
            <motion.div key={post.id} id={`post-${post.id}`} data-post-id={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <PostCard
                post={post}
                userId={user?.uid ?? ''}
                isAdmin={isAdmin}
                channelId={channelId}
                pinnedPostId={channel.pinnedPostId}
                onLike={handleLike}
                onReply={setReplyTarget}
                onDelete={handleDelete}
                onPin={handlePin}
              />
            </motion.div>
          ))}
          <div ref={postsEndRef} />
        </div>
      </div>

      {/* ── Jump to latest FAB ── */}
      <AnimatePresence>
        {showJumpToLatest && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            onClick={() => { postsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnreadCount(0); }}
            className="fixed z-20 flex items-center gap-1.5 px-3 py-2 rounded-full bg-accent text-black text-xs font-bold shadow-lg"
            style={{ bottom: `calc(${COMPOSE_HEIGHT + 64 + 12}px + env(safe-area-inset-bottom, 0px))`, left: '50%', transform: 'translateX(-50%)' }}
          >
            <ChevronsDown className="w-3.5 h-3.5" />
            Jump to latest{unreadCount > 0 ? ` · ${unreadCount} new` : ''}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Compose box (fixed above tab bar) ── */}
      {channel.allowUserPosts === false && !isAdmin ? (
        <div className="fixed above-bottom-nav left-0 right-0 z-20 bg-background/95 backdrop-blur-xl border-t border-white/8">
          <div className="px-4 py-3 max-w-2xl mx-auto w-full flex items-center gap-2 text-sm text-text-secondary">
            <Megaphone className="w-4 h-4 flex-shrink-0" />
            Announcement-only channel — only admins can post here.
          </div>
        </div>
      ) : (
      <div className="fixed above-bottom-nav left-0 right-0 z-20 bg-background/95 backdrop-blur-xl border-t border-white/8">
        <div className="px-4 py-2 max-w-2xl mx-auto w-full space-y-1.5">
          {isBlocked && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Slow mode: next post available {slowModeBlocked!.toLocaleDateString()}
            </div>
          )}
          {/* Image preview */}
          {pendingImageURL && (
            <div className="relative inline-block">
              <img src={pendingImageURL} alt="preview" className="h-16 rounded-lg object-cover" />
              <button
                onClick={() => setPendingImageURL(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImagePick}
            />
            {channel.photoUploadEnabled && !isBlocked && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="p-2 rounded-xl bg-surface border border-white/10 text-text-secondary hover:text-white hover:border-white/20 transition-colors flex-shrink-0 disabled:opacity-50"
              >
                {uploadingImage
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ImageIcon className="w-4 h-4" />
                }
              </button>
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={isBlocked ? 'Slow mode active…' : 'Share something…'}
              disabled={isBlocked}
              rows={1}
              className="flex-1 min-w-0 bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-text-tertiary resize-none focus:outline-none focus:border-accent/50 disabled:opacity-40"
              style={{ maxHeight: 80, overflowY: 'auto' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePost(); } }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 80) + 'px';
              }}
            />
            <Button
              onClick={handlePost}
              loading={posting}
              disabled={!canSend}
              size="sm"
              className="flex-shrink-0 !px-2.5 !py-2"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      )}

      {/* ── Reply sheet ── */}
      <AnimatePresence>
        {replyTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center"
            onClick={() => setReplyTarget(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="w-full max-w-2xl bg-surface-elevated border-t border-white/10 rounded-t-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <p className="text-sm font-bold text-white">Reply to {replyTarget.userDisplayName}</p>
                <button
                  onClick={() => setReplyTarget(null)}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-white/8 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Quoted post */}
              <div className="mx-4 mb-3 bg-surface rounded-xl px-3 py-2 border border-white/8">
                <p className="text-xs text-text-secondary line-clamp-3">{replyTarget.content}</p>
              </div>
              {/* Reply input */}
              <div className="px-4 pb-4 flex gap-2 items-end">
                <textarea
                  ref={replyTextareaRef}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Write a reply…"
                  rows={3}
                  className="flex-1 bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary resize-none focus:outline-none focus:border-accent/50"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                />
                <Button
                  onClick={handleReply}
                  loading={sendingReply}
                  disabled={!replyText.trim()}
                  className="flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {/* iOS safe area */}
              <div className="h-6" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
