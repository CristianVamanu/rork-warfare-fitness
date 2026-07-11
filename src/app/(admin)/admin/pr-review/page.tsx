'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { subscribePRFeed, setPRPostVerification } from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import toast from 'react-hot-toast';
import type { PRPost, VerificationLevel } from '@/types';

const LEVELS: { value: VerificationLevel; label: string }[] = [
  { value: 'unverified', label: 'Unverified' },
  { value: 'trusted', label: 'Trusted' },
  { value: 'video_verified', label: 'Video Verified' },
  { value: 'coach_verified', label: 'Coach Verified' },
  { value: 'competition_verified', label: 'Competition Verified' },
];

export default function PRReviewPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<PRPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  useEffect(() => {
    const unsub = subscribePRFeed((p) => { setPosts(p); setLoading(false); }, 100);
    return unsub;
  }, []);

  const shown = filter === 'pending' ? posts.filter((p) => p.verificationLevel === 'unverified') : posts;

  const setLevel = async (post: PRPost, level: VerificationLevel) => {
    setSavingId(post.id);
    try {
      await setPRPostVerification(post.id, post.userId, level);
      toast.success(`Marked ${post.displayName}'s PR as ${LEVELS.find((l) => l.value === level)?.label}`);
    } catch (err) {
      toast.error('Failed to update — try again');
      console.error('[PRReview] setLevel failed:', err);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 py-4 max-w-2xl mx-auto">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-text-secondary mb-4">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-xl font-black text-white mb-1">PR Wall Review</h1>
        <p className="text-sm text-text-secondary mb-4">
          Review PR submissions and assign a trust badge. Bumping a post also raises that athlete&apos;s overall badge on the leaderboard.
        </p>

        <div className="flex gap-1.5 mb-4">
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${filter === f ? 'bg-accent text-black' : 'bg-surface text-text-secondary'}`}
            >
              {f === 'pending' ? `Pending (${posts.filter((p) => p.verificationLevel === 'unverified').length})` : 'All'}
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
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-white truncate">{post.displayName}</p>
                        <VerificationBadge level={post.verificationLevel} showLabel />
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

                  <div className="flex flex-wrap gap-1.5">
                    {LEVELS.map((l) => (
                      <button
                        key={l.value}
                        disabled={savingId === post.id}
                        onClick={() => setLevel(post, l.value)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${
                          post.verificationLevel === l.value ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
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
