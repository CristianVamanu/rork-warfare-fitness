'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Heart, Upload, MoreHorizontal, Trash2, BadgeCheck, BadgeMinus, EyeOff, Ban } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { PaywallGate } from '@/components/ui/PaywallGate';
import { CommunityTabs } from '@/components/community/CommunityTabs';
import { subscribePRFeed, likePRPost, deletePRPost, getSystemConfig, setPRPostModeration, unverifyPRPost, banUserFromPRWall } from '@/lib/firestore';
import { PRComposer } from '@/components/community/PRComposer';
import type { PRPost } from '@/types';
import { FeedMedia } from '@/components/community/FeedMedia';

export default function PRWallPage() {
  const { user, profile } = useAuth();
  const [posts, setPosts] = useState<PRPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  // Guards against a rapid double-click firing likePRPost() twice for the
  // same post before the first call's optimistic setLiked() update has been
  // committed and re-read — both calls would otherwise derive the same
  // stale wasLiked/nextLiked from the closure and send two +1 increments to
  // the server for what the UI shows as a single like (likeCount drifts
  // upward; likedBy stays correct since arrayUnion is idempotent). A ref
  // (not state) so it's read/written synchronously within one click handler
  // call, immune to React's async state batching.
  const likeInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    getSystemConfig().then((cfg) => setReviewRequired((cfg as { prWallReview?: boolean } | null)?.prWallReview === true)).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = subscribePRFeed((p) => {
      setPosts(p);
      setLoading(false);
      if (user?.uid) {
        setLiked(new Set(p.filter((post) => post.likedBy?.includes(user.uid)).map((post) => post.id)));
      }
    }, user?.uid ?? null);
    return unsub;
  }, [user?.uid]);

  const banUntil = profile?.prBan?.until as { toDate?: () => Date } | null | undefined;
  const isBanned = !!profile?.prBan && (banUntil === null || (banUntil?.toDate?.() ?? new Date(0)) > new Date());

  const handleLike = (id: string) => {
    if (!user || likeInFlight.current.has(id)) return;
    likeInFlight.current.add(id);
    // Toggle — was a one-way "add only" that permanently blocked unliking
    // once liked.has(id) was true, even though likePRPost itself already
    // supports the reverse direction (likedBy: arrayRemove, likeCount: -1).
    const wasLiked = liked.has(id);
    const nextLiked = !wasLiked;
    setLiked((prev) => {
      const next = new Set(prev);
      if (nextLiked) next.add(id); else next.delete(id);
      return next;
    });
    likePRPost(id, user.uid, nextLiked)
      .catch(() => {
        // Roll back the optimistic toggle so the UI doesn't keep showing a
        // state that never actually landed server-side.
        setLiked((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(id); else next.delete(id);
          return next;
        });
        toast.error('Failed to update like — try again');
      })
      .finally(() => likeInFlight.current.delete(id));
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'trainer';

  const handleDelete = (post: PRPost) => {
    if (!confirm(`Delete this "${post.exerciseName}" post?`)) return;
    deletePRPost(post.id).catch(() => alert('Failed to delete — try again.'));
  };
  // Admin moderation straight from the wall, so the review page is optional.
  const handleVerify = (post: PRPost) => {
    const p = post.verificationLevel === 'verified'
      ? unverifyPRPost(post.id).then(() => toast.success('Badge removed'))
      : setPRPostModeration(post.id, 'approved', post).then(() => toast.success(`${post.displayName}'s lift is now Verified`));
    p.catch(() => toast.error('Failed. Try again.'));
  };
  const handleHide = (post: PRPost) => {
    if (!confirm(`Hide this "${post.exerciseName}" post from the wall?`)) return;
    setPRPostModeration(post.id, 'rejected', post).then(() => toast.success('Hidden')).catch(() => toast.error('Failed. Try again.'));
  };
  const handleBan = (post: PRPost) => {
    const raw = prompt(`Ban ${post.displayName} from posting PRs for how many days? (0 = forever)`, '30');
    if (raw === null) return;
    const days = Math.max(0, Math.floor(Number(raw) || 0));
    banUserFromPRWall(post.userId, days === 0 ? null : days).then(() => toast.success(`${post.displayName} banned${days ? ` for ${days} days` : ''}`)).catch(() => toast.error('Failed. Try again.'));
  };

  return (
    <div className="min-h-screen pb-24">
      {/* No back arrow: the PR Wall is one of Community's two views, not a
          sub-page of it, and the switcher below is what moves between them. */}
      <Header title="Community" />
      <div className="px-4 pt-4 max-w-2xl mx-auto w-full">
        <CommunityTabs active="prs" />
      </div>
      <PaywallGate feature="pr-wall" noTaste>
      <div className="px-4 py-4 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto space-y-4">
        {isBanned ? (
          <Card className="p-4 border-danger/30">
            <p className="text-sm text-danger font-bold mb-1">You can&apos;t post to the PR Wall</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              An admin has restricted your posting access{banUntil?.toDate ? ` until ${banUntil.toDate().toLocaleDateString()}` : ' indefinitely'}.
            </p>
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-white font-bold mb-1">Post a PR</p>
            <p className="text-xs text-text-secondary leading-relaxed mb-3">
              {reviewRequired
                ? 'Log the lift with a photo or video. An admin checks it before it shows, and proof earns a Verified badge.'
                : 'Log the lift and it goes straight on the wall. Add a photo or video and an admin can mark it Verified.'}
            </p>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Upload className="w-3.5 h-3.5" /> Post a PR
            </Button>
          </Card>
        )}

        {user && !isBanned && (
          <PRComposer
            open={showForm}
            user={user}
            displayName={profile?.displayName || 'Athlete'}
            photoURL={profile?.photoURL ?? null}
            reviewRequired={reviewRequired}
            onClose={() => setShowForm(false)}
          />
        )}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        ) : posts.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-white font-bold">No PRs posted yet</p>
            <p className="text-text-secondary text-sm mt-1">Be the first to show off a lift.</p>
          </Card>
        ) : (
          posts.map((post, i) => (
            <PRCard
              key={post.id}
              post={post}
              index={i}
              liked={liked.has(post.id)}
              canDelete={isAdmin || post.userId === user?.uid}
              isAdmin={isAdmin}
              onLike={() => handleLike(post.id)}
              onDelete={() => handleDelete(post)}
              onVerify={() => handleVerify(post)}
              onHide={() => handleHide(post)}
              onBan={() => handleBan(post)}
            />
          ))
        )}
      </div>
      </PaywallGate>
    </div>
  );
}

function PRCard({ post, index, liked, canDelete, isAdmin, onLike, onDelete, onVerify, onHide, onBan }: {
  post: PRPost;
  index: number;
  liked: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  onLike: () => void;
  onDelete: () => void;
  onVerify: () => void;
  onHide: () => void;
  onBan: () => void;
}) {
  const verified = post.verificationLevel === 'verified';
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="wf-rise" style={{ animationDelay: `${index * 0.04}s` }}>
      <Card className="p-4 card-float">
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar name={post.displayName} src={post.photoURL} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold text-white truncate">{post.displayName}</p>
              <VerificationBadge level={post.verificationLevel} showLabel />
              {post.moderationStatus === 'pending' && (
                <span className="text-[10px] text-amber-400 font-medium">· Pending review</span>
              )}
              {post.moderationStatus === 'rejected' && (
                <span className="text-[10px] text-danger font-medium">· Hidden</span>
              )}
            </div>
            <p className="text-xs text-text-tertiary">{post.exerciseName}</p>
          </div>
          <div
            className="text-right flex-shrink-0 px-2.5 py-1.5 rounded-xl border border-accent/25"
            style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb) / 0.28), rgba(var(--accent-rgb) / 0.06))' }}
          >
            <p className="text-[15px] font-black text-white leading-none tabular-nums">{post.weightKg}<span className="text-[10px] font-bold text-text-secondary">kg</span></p>
            <p className="text-[10px] text-text-tertiary tabular-nums mt-0.5">× {post.reps}</p>
          </div>
          {canDelete && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-white hover:bg-white/8 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-8 z-20 bg-surface-elevated border border-white/10 rounded-xl shadow-xl min-w-[170px] overflow-hidden">
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => { setShowMenu(false); onVerify(); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
                        >
                          {verified ? <><BadgeMinus className="w-3.5 h-3.5 text-text-secondary" /> Remove badge</> : <><BadgeCheck className="w-3.5 h-3.5 text-accent" /> Mark Verified</>}
                        </button>
                        {post.moderationStatus !== 'rejected' && (
                          <button
                            onClick={() => { setShowMenu(false); onHide(); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
                          >
                            <EyeOff className="w-3.5 h-3.5 text-text-secondary" /> Hide from wall
                          </button>
                        )}
                        <button
                          onClick={() => { setShowMenu(false); onBan(); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-amber-400 hover:bg-white/5 transition-colors"
                        >
                          <Ban className="w-3.5 h-3.5" /> Ban poster
                        </button>
                        <div className="border-t border-white/10" />
                      </>
                    )}
                    <button
                      onClick={() => { setShowMenu(false); onDelete(); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {post.mediaUrl && (
          <div className="rounded-xl overflow-hidden mb-3 bg-black">
            {post.mediaType === 'video' ? (
              <FeedMedia url={post.mediaUrl} kind="video" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <FeedMedia url={post.mediaUrl} alt={post.exerciseName} />
            )}
          </div>
        )}

        {post.note && <p className="text-sm text-text-secondary mb-3">{post.note}</p>}

        <div className="flex items-center justify-between">
          <button
            onClick={onLike}
            className={`flex items-center gap-1.5 text-xs font-medium ${liked ? 'text-danger' : 'text-text-tertiary'}`}
          >
            <Heart className={`w-4 h-4 ${liked ? 'fill-danger' : ''}`} />
            {post.likeCount}
          </button>
          {isAdmin && (
            <button
              onClick={onVerify}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                verified ? 'border-accent/40 bg-accent/10 text-accent' : 'border-white/10 text-text-secondary hover:text-white hover:border-white/25'
              }`}
              title={verified ? 'Tap to remove the badge' : 'Tap to give the Verified badge'}
            >
              <BadgeCheck className="w-3.5 h-3.5" /> {verified ? 'Verified' : 'Verify'}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
