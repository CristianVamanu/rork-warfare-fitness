'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Trash2, Ban, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  subscribeAllPRPosts, setPRPostModeration, deletePRPost,
  banUserFromPRWall, unbanUserFromPRWall,
} from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import toast from 'react-hot-toast';
import type { PRPost } from '@/types';

const BAN_OPTIONS: { label: string; days: number | null }[] = [
  { label: '7 days', days: 7 },
  { label: '21 days', days: 21 },
  { label: '30 days', days: 30 },
  { label: 'Forever', days: null },
];

export default function PRReviewPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<PRPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banMenuFor, setBanMenuFor] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  useEffect(() => {
    const unsub = subscribeAllPRPosts((p) => { setPosts(p); setLoading(false); }, 100);
    return unsub;
  }, []);

  const shown = filter === 'pending' ? posts.filter((p) => p.moderationStatus === 'pending') : posts;

  const withBusy = async (id: string, fn: () => Promise<void>, successMsg: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(successMsg);
    } catch (err) {
      toast.error('Action failed — try again');
      console.error('[PRReview] action failed:', err);
    } finally {
      setBusyId(null);
    }
  };

  const approve = (post: PRPost) => withBusy(post.id, () => setPRPostModeration(post.id, 'approved'), 'Approved — visible on the PR Wall with a Verified badge');
  const reject = (post: PRPost) => withBusy(post.id, () => setPRPostModeration(post.id, 'rejected'), 'Post rejected — hidden from the PR Wall');
  const removePost = (post: PRPost) => {
    if (!confirm(`Permanently delete ${post.displayName}'s "${post.exerciseName}" post?`)) return;
    withBusy(post.id, () => deletePRPost(post.id), 'Post deleted');
  };
  const ban = (post: PRPost, days: number | null) => {
    setBanMenuFor(null);
    withBusy(post.id, () => banUserFromPRWall(post.userId, days), `${post.displayName} banned from the PR Wall${days ? ` for ${days} days` : ' indefinitely'}`);
  };
  const unban = (post: PRPost) => withBusy(post.id, () => unbanUserFromPRWall(post.userId), `${post.displayName} unbanned`);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 py-4 max-w-2xl mx-auto">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-text-secondary mb-4">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-xl font-black text-white mb-1">PR Wall Review</h1>
        <p className="text-sm text-text-secondary mb-4">
          Approve a post to make it visible on the PR Wall with a Verified badge on that lift. Reject to hide it. Manage posting bans below.
        </p>

        <div className="flex gap-1.5 mb-4">
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${filter === f ? 'bg-accent text-black' : 'bg-surface text-text-secondary'}`}
            >
              {f === 'pending' ? `Pending (${posts.filter((p) => p.moderationStatus === 'pending').length})` : 'All'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
        ) : shown.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-white font-bold">Nothing to review</p>
            <p className="text-text-secondary text-sm mt-1">{filter === 'pending' ? 'All caught up.' : 'No PRs posted yet.'}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {shown.map((post, i) => (
              <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center flex-shrink-0 text-xs font-bold text-accent">
                      {post.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-bold text-white truncate">{post.displayName}</p>
                        <VerificationBadge level={post.verificationLevel} showLabel />
                        <span className={`text-[10px] font-medium ${
                          post.moderationStatus === 'approved' ? 'text-green-400' : post.moderationStatus === 'rejected' ? 'text-danger' : 'text-amber-400'
                        }`}>
                          · {post.moderationStatus === 'approved' ? 'Live' : post.moderationStatus === 'rejected' ? 'Rejected' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-xs text-text-tertiary">{post.exerciseName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-accent">{post.weightKg}kg</p>
                      <p className="text-[10px] text-text-tertiary">× {post.reps}</p>
                    </div>
                  </div>

                  {post.mediaUrl && (
                    <div className="rounded-xl overflow-hidden mb-3 bg-black">
                      {post.mediaType === 'video' ? (
                        <video src={post.mediaUrl} controls className="w-full max-h-72" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.mediaUrl} alt={post.exerciseName} className="w-full max-h-72 object-cover" />
                      )}
                    </div>
                  )}
                  {!post.mediaUrl && (
                    <p className="text-xs text-text-tertiary italic mb-3">No photo/video attached — verify with care.</p>
                  )}
                  {post.note && <p className="text-sm text-text-secondary mb-3">{post.note}</p>}

                  {/* Moderation — approve/reject gate visibility on the public wall */}
                  <div className="flex gap-1.5 mb-2">
                    <button
                      disabled={busyId === post.id}
                      onClick={() => approve(post)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 ${post.moderationStatus === 'approved' ? 'bg-green-500 text-black' : 'bg-surface-elevated text-white'}`}
                    >
                      Approve
                    </button>
                    <button
                      disabled={busyId === post.id}
                      onClick={() => reject(post)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 ${post.moderationStatus === 'rejected' ? 'bg-danger text-white' : 'bg-surface-elevated text-white'}`}
                    >
                      Reject
                    </button>
                    <button
                      disabled={busyId === post.id}
                      onClick={() => removePost(post)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-surface-elevated text-danger disabled:opacity-50"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="relative">
                      <button
                        disabled={busyId === post.id}
                        onClick={() => setBanMenuFor(banMenuFor === post.id ? null : post.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-surface-elevated text-amber-400 disabled:opacity-50"
                        title="Ban user from posting"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                      {banMenuFor === post.id && (
                        <div className="absolute right-0 top-full mt-1 z-10 bg-surface-elevated border border-white/10 rounded-lg overflow-hidden shadow-lg w-32">
                          {BAN_OPTIONS.map((opt) => (
                            <button
                              key={opt.label}
                              onClick={() => ban(post, opt.days)}
                              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5"
                            >
                              {opt.label}
                            </button>
                          ))}
                          <button
                            onClick={() => { setBanMenuFor(null); unban(post); }}
                            className="w-full text-left px-3 py-2 text-xs text-green-400 hover:bg-white/5 border-t border-white/10 flex items-center gap-1.5"
                          >
                            <ShieldCheck className="w-3 h-3" /> Unban
                          </button>
                        </div>
                      )}
                    </div>
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
