'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Trophy, Search, Plus, Image } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getPosts, createPost } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import type { Post } from '@/types';

const LEADERBOARD = [
  { rank: 1, name: 'Alpha Wolf', streak: 45, points: 1240 },
  { rank: 2, name: 'Iron Mike', streak: 38, points: 980 },
  { rank: 3, name: 'Beast Mode', streak: 30, points: 875 },
  { rank: 4, name: 'Steel Amy', streak: 28, points: 740 },
  { rank: 5, name: 'Max Power', streak: 22, points: 620 },
];

export default function CommunityPage() {
  const { user, profile, trainerId } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'feed' | 'leaderboard'>('feed');
  const [createModal, setCreateModal] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    getPosts(20, trainerId ?? undefined)
      .then((p) => setPosts(p as Post[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [trainerId]);

  const handlePost = async () => {
    if (!user || !profile || !postContent.trim()) return;
    setPosting(true);
    try {
      await createPost({
        userId: user.uid,
        trainerId: trainerId ?? undefined,
        userDisplayName: profile.displayName,
        userPhotoURL: profile.photoURL || undefined,
        content: postContent,
      });
      setPostContent('');
      setCreateModal(false);
      toast.success('Post published!');
      const updated = await getPosts();
      setPosts(updated as Post[]);
    } catch {
      toast.error('Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = (postId: string) => {
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  };

  const formatTime = (ts: unknown) => {
    if (!ts) return 'just now';
    const date = (ts as { toDate?: () => Date }).toDate?.() || new Date();
    const diff = Math.round((Date.now() - date.getTime()) / 60000);
    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff}m`;
    if (diff < 1440) return `${Math.round(diff / 60)}h`;
    return `${Math.round(diff / 1440)}d`;
  };

  return (
    <div>
      <Header title="Community" />
      <div className="px-4 py-4 space-y-4">
        {/* Tabs */}
        <div className="grid grid-cols-2 gap-1 bg-surface rounded-xl p-1">
          {(['feed', 'leaderboard'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 text-sm font-medium rounded-lg transition-all capitalize ${
                tab === t ? 'bg-surface-elevated text-white' : 'text-text-secondary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'feed' && (
          <>
            {/* Create Post Button */}
            <button
              onClick={() => setCreateModal(true)}
              className="w-full flex items-center gap-3 p-4 bg-surface border border-white/8 rounded-2xl text-left"
            >
              <Avatar name={profile?.displayName} size="sm" />
              <span className="text-text-tertiary text-sm flex-1">Share your progress...</span>
              <Image className="w-4 h-4 text-text-tertiary" />
            </button>

            {/* Posts Feed */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
              </div>
            ) : posts.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-3xl mb-3">💪</p>
                <p className="text-white font-bold">No posts yet</p>
                <p className="text-text-secondary text-sm mt-1">Be the first to share!</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {posts.map((post, i) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <Avatar name={post.userDisplayName} src={post.userPhotoURL} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white">{post.userDisplayName}</p>
                          <p className="text-xs text-text-secondary">{formatTime(post.createdAt)}</p>
                        </div>
                      </div>
                      <p className="text-sm text-white leading-relaxed">{post.content}</p>
                      <div className="flex items-center gap-4 mt-4">
                        <button
                          onClick={() => toggleLike(post.id)}
                          className={`flex items-center gap-1.5 text-xs transition-colors ${
                            likedPosts.has(post.id) ? 'text-danger' : 'text-text-secondary hover:text-danger'
                          }`}
                        >
                          <Heart className={`w-4 h-4 ${likedPosts.has(post.id) ? 'fill-current' : ''}`} />
                          {post.likes.length + (likedPosts.has(post.id) ? 1 : 0)}
                        </button>
                        <button className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-white transition-colors">
                          <MessageCircle className="w-4 h-4" />
                          {post.commentCount}
                        </button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'leaderboard' && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-white">Monthly Leaderboard</h2>
            {LEADERBOARD.map((entry, i) => (
              <motion.div
                key={entry.rank}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card className={`p-4 flex items-center gap-3 ${entry.rank <= 3 ? 'border-accent/20' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                    entry.rank === 1 ? 'bg-yellow-400 text-black' :
                    entry.rank === 2 ? 'bg-gray-300 text-black' :
                    entry.rank === 3 ? 'bg-amber-600 text-white' :
                    'bg-surface-elevated text-text-secondary'
                  }`}>
                    {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                  </div>
                  <Avatar name={entry.name} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">{entry.name}</p>
                    <p className="text-xs text-text-secondary">🔥 {entry.streak} day streak</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-accent">{entry.points}</p>
                    <p className="text-xs text-text-secondary">pts</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Post Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Post">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Avatar name={profile?.displayName} size="md" />
            <textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder="Share your workout, achievement, or tip..."
              rows={4}
              className="flex-1 bg-surface-elevated border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button fullWidth loading={posting} disabled={!postContent.trim()} onClick={handlePost}>
              Post
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
