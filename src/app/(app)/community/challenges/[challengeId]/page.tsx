'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Users, CheckCircle2, Trophy, Heart, Trash2, Send, ShieldCheck, Clock, Flame } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { PaywallGate } from '@/components/ui/PaywallGate';
import { FeedCarousel } from '@/components/community/FeedCarousel';
import { MediaPicker } from '@/components/community/MediaPicker';
import { ShareChallengeButton } from '@/components/community/ShareChallengeButton';
import { DEFAULT_CHALLENGE_XP } from '@/types';
import { RESULT_TYPES, DIFFICULTY, timeline, bucket, betterFirst, toDate } from '@/components/community/challengeFormat';
import {
  subscribeChallenge, subscribeMyEntry, subscribeEntries, subscribeChallengePosts,
  enterChallenge, submitChallengeResult, createChallengePost, likeChallengePost, deleteChallengePost,
} from '@/lib/challenges';
import type { Challenge, ChallengeEntry, ChallengePost, PostMedia } from '@/types';

const PROOF_MAX = 6;

function timeAgo(ts: unknown): string {
  const d = toDate(ts);
  if (!d) return 'just now';
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days < 7 ? `${days}d ago` : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ChallengePage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();
  const id = typeof params.challengeId === 'string' ? params.challengeId : '';
  const isAdmin = profile?.role === 'admin' || profile?.role === 'trainer';

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [entry, setEntry] = useState<ChallengeEntry | null>(null);
  const [entries, setEntries] = useState<ChallengeEntry[]>([]);
  const [posts, setPosts] = useState<ChallengePost[]>([]);
  const [entering, setEntering] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [tab, setTab] = useState<'feed' | 'board'>('feed');

  useEffect(() => {
    if (!id) return;
    const u1 = subscribeChallenge(id, (c) => { setChallenge(c); setLoaded(true); }, () => setLoaded(true));
    const u2 = subscribeEntries(id, setEntries);
    const u3 = subscribeChallengePosts(id, setPosts);
    return () => { u1(); u2(); u3(); };
  }, [id]);
  useEffect(() => {
    if (!id || !user) return;
    return subscribeMyEntry(id, user.uid, setEntry);
  }, [id, user]);

  const state = challenge ? bucket(challenge) : 'draft';
  const live = state === 'live' && challenge?.status === 'live';

  // The board: verified first, sorted by result; then submitted, unsorted
  // pending review. Rejected and merely-entered stay off it.
  const board = useMemo(() => {
    if (!challenge) return [];
    const cmp = betterFirst(challenge.resultType);
    const verified = entries.filter((e) => e.status === 'verified' && typeof e.resultValue === 'number').sort((a, b) => cmp(a.resultValue!, b.resultValue!));
    const verifiedNoValue = entries.filter((e) => e.status === 'verified' && typeof e.resultValue !== 'number');
    const pending = entries.filter((e) => e.status === 'submitted');
    return [...verified, ...verifiedNoValue, ...pending];
  }, [entries, challenge]);

  async function onEnter() {
    if (!user || !challenge) return;
    setEntering(true);
    try {
      await enterChallenge(challenge.id, { uid: user.uid, displayName: profile?.displayName || 'Athlete', photoURL: profile?.photoURL });
      toast.success("You're in. Now go do it.");
    } catch {
      toast.error('Could not enter — try again');
    } finally {
      setEntering(false);
    }
  }

  if (!loaded) {
    return <div className="px-4 py-4 max-w-2xl mx-auto space-y-3"><Skeleton className="h-10 rounded-xl" /><Skeleton className="aspect-[4/5] rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>;
  }
  if (!challenge) {
    return (
      <div className="px-4 py-10 max-w-2xl mx-auto text-center">
        <p className="text-white font-bold">Challenge not found</p>
        <Button size="sm" className="mt-4" onClick={() => router.push('/community/challenges')}>Back to challenges</Button>
      </div>
    );
  }

  const diff = DIFFICULTY[challenge.difficulty] ?? DIFFICULTY.standard;
  const when = timeline(challenge);
  const rt = RESULT_TYPES.find((r) => r.id === challenge.resultType) ?? RESULT_TYPES[0];

  return (
    <PaywallGate feature="community" noTaste>
      <div className="min-h-screen pb-28">
        <div className="sticky top-0 z-30 backdrop-blur-xl border-b border-white/8">
          <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto w-full">
            <button onClick={() => router.push('/community/challenges')} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5 transition-colors flex-shrink-0" aria-label="Back">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">{challenge.category || 'Challenge'}</p>
              <p className="text-sm font-bold text-white truncate">{challenge.title}</p>
            </div>
            <div className="flex items-center gap-0.5" title={diff.label} aria-label={diff.label}>
              {[1, 2, 3].map((n) => <span key={n} className={`w-1.5 h-3 rounded-sm ${n <= diff.bars ? 'bg-accent' : 'bg-white/20'}`} />)}
            </div>
            <ShareChallengeButton challengeId={challenge.id} title={challenge.title} entered={!!entry} variant="icon" />
          </div>
        </div>

        <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
          {/* Carousel */}
          {challenge.media?.length > 0 && <FeedCarousel items={challenge.media} className="!mt-0" />}

          {/* Brief + numbers */}
          <Card className="p-4 space-y-3">
            <div>
              <h1 className="text-2xl font-black text-white leading-tight">{challenge.title}</h1>
              <p className="text-sm text-text-secondary mt-1 leading-relaxed">{challenge.brief}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-text-secondary">
              <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {challenge.entryCount ?? 0} entered</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> {challenge.verifiedCount ?? 0} finished</span>
              {when && <span className="ml-auto flex items-center gap-1.5 text-text-tertiary"><Clock className="w-3.5 h-3.5" /> {when}</span>}
            </div>
            {(challenge.loadoutMen || challenge.loadoutWomen) && (
              <div className="grid grid-cols-2 gap-2">
                {challenge.loadoutMen && <Loadout who="Men" text={challenge.loadoutMen} />}
                {challenge.loadoutWomen && <Loadout who="Women" text={challenge.loadoutWomen} />}
              </div>
            )}
            {challenge.rules && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent mb-1">The rules</p>
                <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">{challenge.rules}</p>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-text-tertiary">Result: {rt.label.toLowerCase()} · {rt.hint}. Checked by an admin before it counts.</p>
              <span className="flex-shrink-0 px-2.5 py-1 rounded-full border border-accent/40 text-accent text-xs font-black tabular-nums">+{challenge.xpReward ?? DEFAULT_CHALLENGE_XP} XP</span>
            </div>
          </Card>

          {/* Enter / submit / status */}
          <EntryAction
            live={live}
            state={state}
            entry={entry}
            entering={entering}
            onEnter={onEnter}
            onSubmit={() => setShowSubmit(true)}
          />

          {/* Bringing someone in is the retention move: a challenge done
              with a partner is one you actually finish. Shown once entered,
              so it reads as "your turn to recruit", not as an ad. */}
          {entry && (
            <Card className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Don&apos;t suffer alone.</p>
                <p className="text-xs text-text-secondary mt-0.5">Send this to the one who says it&apos;s easy. They join through your link.</p>
              </div>
              <ShareChallengeButton challengeId={challenge.id} title={challenge.title} entered className="flex-shrink-0" />
            </Card>
          )}

          {/* Feed / board */}
          <div className="flex gap-2" role="tablist">
            {(['feed', 'board'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`h-9 px-4 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${tab === t ? 'bg-accent text-black shadow-glow-sm' : 'text-text-secondary hover:text-white'}`}
                style={tab === t ? undefined : { backgroundColor: 'var(--card-glass-bg)', border: '1px solid var(--card-glass-border)' }}>
                {t === 'feed' ? <><Flame className="w-3.5 h-3.5" /> Feed · {posts.length}</> : <><Trophy className="w-3.5 h-3.5" /> Board · {board.length}</>}
              </button>
            ))}
          </div>

          {tab === 'board' ? (
            <Board board={board} challenge={challenge} meUid={user?.uid} />
          ) : (
            <>
              {posts.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-white font-bold">Nothing posted yet</p>
                  <p className="text-text-secondary text-sm mt-1">{entry ? 'You entered. Say something, or post your result.' : 'Enter the challenge to post here.'}</p>
                </Card>
              ) : (
                posts.map((p) => (
                  <PostCard key={p.id} post={p} challenge={challenge} meUid={user?.uid} canDelete={isAdmin || p.userId === user?.uid}
                    entryStatus={entries.find((e) => e.userId === p.userId)?.status} />
                ))
              )}
            </>
          )}
        </div>

        {/* Compose bar: only for entrants (or admins), only on the feed. */}
        {tab === 'feed' && user && (entry || isAdmin) && (
          <Composer challengeId={challenge.id} user={{ uid: user.uid, displayName: profile?.displayName || 'Athlete', photoURL: profile?.photoURL, isAdmin: profile?.role === 'admin' }} />
        )}

        {user && (
          <SubmitModal
            open={showSubmit}
            onClose={() => setShowSubmit(false)}
            challenge={challenge}
            user={{ uid: user.uid, displayName: profile?.displayName || 'Athlete', photoURL: profile?.photoURL, isAdmin: profile?.role === 'admin' }}
          />
        )}
      </div>
    </PaywallGate>
  );
}

function Loadout({ who, text }: { who: string; text: string }) {
  return (
    <div className="rounded-xl border border-accent/25 px-3 py-2" style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb) / 0.16), rgba(var(--accent-rgb) / 0.03))' }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">{who}</p>
      <p className="text-sm font-semibold text-white mt-0.5 whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function EntryAction({ live, state, entry, entering, onEnter, onSubmit }: {
  live: boolean; state: ReturnType<typeof bucket>; entry: ChallengeEntry | null; entering: boolean; onEnter: () => void; onSubmit: () => void;
}) {
  if (!entry) {
    if (state === 'upcoming') return <Card className="p-4 text-center text-sm text-text-secondary">Not open yet. Come back when it goes live.</Card>;
    if (!live) return <Card className="p-4 text-center text-sm text-text-secondary">This challenge is closed. The board stays up.</Card>;
    return (
      <Button fullWidth size="lg" onClick={onEnter} loading={entering}>
        <Flame className="w-4 h-4" /> Enter challenge
      </Button>
    );
  }
  if (entry.status === 'entered') {
    return (
      <div className="space-y-2">
        <Button fullWidth size="lg" onClick={onSubmit} disabled={!live}>
          <Send className="w-4 h-4" /> Submit my result
        </Button>
        <p className="text-center text-[11px] text-text-tertiary">{live ? "You're in. Do it, film the end, submit." : 'Submissions closed.'}</p>
      </div>
    );
  }
  const map = {
    submitted: { icon: Clock, text: 'Submitted — waiting for review', cls: 'text-amber-300 border-amber-400/30 bg-amber-400/10' },
    verified: { icon: ShieldCheck, text: `Verified · ${entry.result}`, cls: 'text-accent border-accent/40 bg-accent/10' },
    rejected: { icon: Trash2, text: entry.reviewNote ? `Not verified: ${entry.reviewNote}` : 'Not verified — ask an admin to reopen it', cls: 'text-danger border-danger/30 bg-danger/10' },
  } as const;
  const m = map[entry.status];
  const Icon = m.icon;
  return (
    <div className={`rounded-2xl border px-4 py-3 flex items-center gap-2.5 text-sm font-semibold ${m.cls}`}>
      <Icon className="w-4 h-4 flex-shrink-0" /> {m.text}
    </div>
  );
}

function Board({ board, challenge, meUid }: { board: ChallengeEntry[]; challenge: Challenge; meUid?: string }) {
  if (board.length === 0) {
    return <Card className="p-8 text-center"><p className="text-white font-bold">Board is empty</p><p className="text-text-secondary text-sm mt-1">First verified result takes the top.</p></Card>;
  }
  let rank = 0;
  return (
    <Card className="divide-y divide-white/6">
      {board.map((e) => {
        const verified = e.status === 'verified';
        if (verified) rank += 1;
        const me = e.userId === meUid;
        return (
          <div key={e.id} className={`flex items-center gap-3 px-4 py-3 ${me ? 'bg-accent/5' : ''}`}>
            <span className={`w-7 text-center font-black tabular-nums ${verified && rank <= 3 ? 'text-accent' : 'text-text-tertiary'}`}>{verified ? rank : '·'}</span>
            <Avatar name={e.displayName} src={e.photoURL} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{e.displayName}{me && <span className="text-text-tertiary font-normal"> (you)</span>}</p>
              <p className="text-[11px] text-text-tertiary">{verified ? 'Verified' : 'Pending review'}</p>
            </div>
            <div className="text-right">
              <p className="text-base font-black text-white tabular-nums">{e.result}</p>
              {challenge.resultType !== 'time' && challenge.resultType !== 'done' && <p className="text-[10px] text-text-tertiary">{RESULT_TYPES.find((r) => r.id === challenge.resultType)?.unit}</p>}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function PostCard({ post, challenge, meUid, canDelete, entryStatus }: {
  post: ChallengePost; challenge: Challenge; meUid?: string; canDelete: boolean; entryStatus?: ChallengeEntry['status'];
}) {
  const liked = !!meUid && post.likes.includes(meUid);
  const [busy, setBusy] = useState(false);
  const like = async () => {
    if (!meUid || busy) return;
    setBusy(true);
    await likeChallengePost(challenge.id, post.id, meUid, !liked).catch(() => toast.error('Could not update like'));
    setBusy(false);
  };
  const del = async () => {
    if (!confirm('Delete this post?')) return;
    await deleteChallengePost(challenge.id, post.id).catch(() => toast.error('Could not delete'));
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <Avatar name={post.userDisplayName} src={post.userPhotoURL} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-white truncate">{post.userDisplayName}</p>
            {post.userIsAdmin && <Badge variant="danger">Admin</Badge>}
          </div>
          <p className="text-[11px] text-text-tertiary">{timeAgo(post.createdAt)}</p>
        </div>
        {post.submission && (
          <div className="text-right flex-shrink-0 px-2.5 py-1.5 rounded-xl border border-accent/25" style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb) / 0.28), rgba(var(--accent-rgb) / 0.06))' }}>
            <p className="text-[15px] font-black text-white leading-none tabular-nums">{post.submission.result}</p>
            <p className={`text-[10px] mt-0.5 font-semibold ${entryStatus === 'verified' ? 'text-accent' : entryStatus === 'rejected' ? 'text-danger' : 'text-text-tertiary'}`}>
              {entryStatus === 'verified' ? 'Verified' : entryStatus === 'rejected' ? 'Not verified' : 'Result · pending'}
            </p>
          </div>
        )}
        {canDelete && (
          <button onClick={del} className="p-1.5 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors" aria-label="Delete post"><Trash2 className="w-4 h-4" /></button>
        )}
      </div>
      {post.content && <p className="text-sm text-white leading-relaxed whitespace-pre-wrap mt-3">{post.content}</p>}
      {post.media && post.media.length > 0 && <FeedCarousel items={post.media} />}
      <button onClick={like} className={`flex items-center gap-1.5 text-xs mt-3 transition-colors ${liked ? 'text-danger' : 'text-text-secondary hover:text-danger'}`}>
        <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} /> {post.likes.length}
      </button>
    </Card>
  );
}

function Composer({ challengeId, user }: { challengeId: string; user: { uid: string; displayName: string; photoURL?: string | null; isAdmin?: boolean } }) {
  const [text, setText] = useState('');
  const [media, setMedia] = useState<PostMedia[]>([]);
  const [posting, setPosting] = useState(false);
  const canSend = (text.trim().length > 0 || media.length > 0) && !posting;
  const send = async () => {
    if (!canSend) return;
    setPosting(true);
    try {
      await createChallengePost(challengeId, user, { content: text, media });
      setText(''); setMedia([]);
    } catch {
      toast.error('Failed to post');
    } finally {
      setPosting(false);
    }
  };
  return (
    <div className="fixed above-bottom-nav left-0 right-0 z-20 bg-background/95 backdrop-blur-xl border-t border-white/8">
      <div className="px-4 py-2 max-w-2xl mx-auto w-full space-y-1.5">
        <div className="flex gap-2 items-end">
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <MediaPicker value={media} onChange={setMedia} max={PROOF_MAX} compact />
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something to the others…" rows={1}
            className="flex-1 min-w-0 bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-text-tertiary resize-none focus:outline-none focus:border-accent/50"
            style={{ maxHeight: 80, overflowY: 'auto' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <Button onClick={send} loading={posting} disabled={!canSend} size="sm" className="flex-shrink-0 !px-2.5 !py-2"><Send className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function SubmitModal({ open, onClose, challenge, user }: {
  open: boolean; onClose: () => void; challenge: Challenge; user: { uid: string; displayName: string; photoURL?: string | null; isAdmin?: boolean };
}) {
  const rt = RESULT_TYPES.find((r) => r.id === challenge.resultType) ?? RESULT_TYPES[0];
  const [result, setResult] = useState(challenge.resultType === 'done' ? 'Done' : '');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<PostMedia[]>([]);
  const [saving, setSaving] = useState(false);
  const ok = result.trim().length > 0 && proof.length > 0;
  const submit = async () => {
    if (!ok) return;
    setSaving(true);
    try {
      await submitChallengeResult(challenge, user, { result, note, proof });
      toast.success('Submitted. An admin will verify it.');
      onClose();
    } catch (err) {
      console.error('[challenge] submit failed', err);
      toast.error('Could not submit — try again');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Submit your result"
      footer={<div className="flex gap-2"><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={submit} loading={saving} disabled={!ok}>Submit</Button></div>}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">{challenge.resultLabel || rt.label}{rt.unit ? ` (${rt.unit})` : ''}</label>
          {challenge.resultType === 'done' ? (
            <p className="text-sm text-white">Finishing is the result. Attach proof of the last rep.</p>
          ) : (
            <input value={result} onChange={(e) => setResult(e.target.value)} placeholder={rt.placeholder} inputMode={challenge.resultType === 'time' ? 'numeric' : 'decimal'}
              className="w-full bg-surface-elevated border border-white/8 rounded-xl px-3 py-2.5 text-lg font-black text-white tabular-nums placeholder:text-text-tertiary placeholder:font-normal" />
          )}
          <p className="text-[11px] text-text-tertiary mt-1">{rt.hint}</p>
        </div>
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Proof <span className="text-danger">*</span></label>
          <MediaPicker value={proof} onChange={setProof} max={PROOF_MAX} label="Add your proof — a clip of the last round is best" />
          <p className="text-[11px] text-text-tertiary mt-1">No proof, no verification. Show the load and the last reps.</p>
        </div>
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Note (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Where it hurt, what you'd do differently…"
            className="w-full bg-surface-elevated border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary resize-none" />
        </div>
      </div>
    </Modal>
  );
}
