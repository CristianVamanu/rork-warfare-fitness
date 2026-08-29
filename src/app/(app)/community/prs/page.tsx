'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Heart, Upload, X, Video, Image as ImageIcon, MoreHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { PaywallGate } from '@/components/ui/PaywallGate';
import { subscribePRFeed, createPRPost, likePRPost, deletePRPost, getSystemConfig } from '@/lib/firestore';
import { uploadUserContent, type StorageProvider } from '@/lib/uploadVideo';
import type { PRPost } from '@/types';

export default function PRWallPage() {
  const { user, profile } = useAuth();
  const [posts, setPosts] = useState<PRPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());

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
    if (!user) return;
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
    likePRPost(id, user.uid, nextLiked).catch(() => {
      // Roll back the optimistic toggle so the UI doesn't keep showing a
      // state that never actually landed server-side.
      setLiked((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(id); else next.delete(id);
        return next;
      });
      toast.error('Failed to update like — try again');
    });
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'trainer';

  const handleDelete = (post: PRPost) => {
    if (!confirm(`Delete this "${post.exerciseName}" post?`)) return;
    deletePRPost(post.id).catch(() => alert('Failed to delete — try again.'));
  };

  return (
    <div className="min-h-screen pb-24">
      <Header title="PR Wall" showBack />
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
            <p className="text-sm text-white font-bold mb-1">Post a PR, get it verified</p>
            <p className="text-xs text-text-secondary leading-relaxed mb-3">
              Upload a video or photo of your lift. New posts are reviewed by an admin before showing to everyone. Verified PRs stand out on the leaderboard.
            </p>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Upload className="w-3.5 h-3.5" /> Post a PR
            </Button>
          </Card>
        )}

        {showForm && user && !isBanned && (
          <PRForm
            userId={user.uid}
            displayName={profile?.displayName || 'Athlete'}
            photoURL={profile?.photoURL ?? null}
            onDone={() => setShowForm(false)}
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
              onLike={() => handleLike(post.id)}
              onDelete={() => handleDelete(post)}
            />
          ))
        )}
      </div>
      </PaywallGate>
    </div>
  );
}

function PRCard({ post, index, liked, canDelete, onLike, onDelete }: {
  post: PRPost;
  index: number;
  liked: boolean;
  canDelete: boolean;
  onLike: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center flex-shrink-0 text-xs font-bold text-accent">
            {post.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-bold text-white truncate">{post.displayName}</p>
              <VerificationBadge level={post.verificationLevel} showLabel />
              {post.moderationStatus === 'pending' && (
                <span className="text-[10px] text-amber-400 font-medium">· Pending review</span>
              )}
            </div>
            <p className="text-xs text-text-tertiary">{post.exerciseName}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-black text-accent">{post.weightKg}kg</p>
            <p className="text-[10px] text-text-tertiary">× {post.reps}</p>
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
                  <div className="absolute right-0 top-8 z-20 bg-surface-elevated border border-white/10 rounded-xl shadow-xl min-w-[120px]">
                    <button
                      onClick={() => { setShowMenu(false); onDelete(); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors rounded-xl"
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
              <video src={post.mediaUrl} controls crossOrigin="anonymous" className="w-full max-h-80" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.mediaUrl} alt={post.exerciseName} className="w-full max-h-80 object-cover" />
            )}
          </div>
        )}

        {post.note && <p className="text-sm text-text-secondary mb-3">{post.note}</p>}

        <button
          onClick={onLike}
          className={`flex items-center gap-1.5 text-xs font-medium ${liked ? 'text-danger' : 'text-text-tertiary'}`}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-danger' : ''}`} />
          {post.likeCount}
        </button>
      </Card>
    </motion.div>
  );
}

function PRForm({ userId, displayName, photoURL, onDone }: { userId: string; displayName: string; photoURL: string | null; onDone: () => void }) {
  const { user } = useAuth();
  const [exerciseName, setExerciseName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [reps, setReps] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!user || !exerciseName || !weightKg || !reps) return;
    setUploading(true);
    try {
      let mediaUrl: string | undefined;
      let mediaType: 'image' | 'video' | undefined;
      if (file) {
        mediaType = file.type.startsWith('video') ? 'video' : 'image';
        const cfg = await getSystemConfig().catch(() => null);
        const provider = ((cfg?.storageProvider as StorageProvider) || 'firebase');
        mediaUrl = await uploadUserContent(provider, user, file, 'prPosts', setProgress);
      }
      await createPRPost({
        userId,
        displayName,
        photoURL,
        exerciseName,
        weightKg: Number(weightKg),
        reps: Number(reps),
        note: note || undefined,
        mediaUrl,
        mediaType,
        // Uploading a video/photo self-flags for review — actual promotion to
        // "Video Verified" happens via admin/coach review, not automatically.
        verificationLevel: 'unverified',
      });
      onDone();
    } catch (err) {
      console.error('[PRForm] submit failed:', err);
      toast.error('Failed to post — try again');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-white">New PR</p>
        <button onClick={onDone}><X className="w-4 h-4 text-text-tertiary" /></button>
      </div>
      <input
        value={exerciseName}
        onChange={(e) => setExerciseName(e.target.value)}
        placeholder="Exercise (e.g. Deadlift)"
        className="w-full bg-surface-elevated border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary"
      />
      <div className="flex gap-2">
        <input
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          type="number"
          placeholder="Weight (kg)"
          className="flex-1 bg-surface-elevated border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary"
        />
        <input
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          type="number"
          placeholder="Reps"
          className="w-24 bg-surface-elevated border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary"
        />
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note..."
        rows={2}
        className="w-full bg-surface-elevated border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary resize-none"
      />

      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl py-3 text-xs text-text-secondary"
      >
        {file ? (file.type.startsWith('video') ? <Video className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />) : <Upload className="w-4 h-4" />}
        {file ? file.name : 'Add video/photo proof (recommended)'}
      </button>

      {uploading && file && (
        <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <Button fullWidth onClick={submit} loading={uploading} disabled={!exerciseName || !weightKg || !reps}>
        Post PR
      </Button>
    </Card>
  );
}
