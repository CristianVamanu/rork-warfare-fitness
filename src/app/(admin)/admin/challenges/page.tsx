'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Edit2, Trash2, ShieldCheck, XCircle, RotateCcw, Users, CheckCircle2, ExternalLink, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { MediaPicker } from '@/components/community/MediaPicker';
import { FeedCarousel } from '@/components/community/FeedCarousel';
import { RESULT_TYPES, DIFFICULTY, bucket, toDate } from '@/components/community/challengeFormat';
import {
  getChallenges, createChallenge, updateChallenge, deleteChallenge,
  subscribeEntries, reviewChallengeEntry, reopenEntry, announceChallenge, ensurePosters, type ChallengeInput,
} from '@/lib/challenges';
import { DEFAULT_CHALLENGE_XP } from '@/types';
import { Timestamp, collection, getDocs, doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Challenge, ChallengeEntry, ChallengeDifficulty, ChallengeResultType, ChallengeStatus, PostMedia } from '@/types';

const CAROUSEL_MAX = 10;

type Form = {
  title: string; brief: string; rules: string; category: string;
  difficulty: ChallengeDifficulty; media: PostMedia[];
  loadoutMen: string; loadoutWomen: string;
  resultType: ChallengeResultType; resultLabel: string;
  status: ChallengeStatus; startsAt: string; endsAt: string;
  xpReward: string;
};
const EMPTY: Form = {
  title: '', brief: '', rules: '', category: '', difficulty: 'hard', media: [],
  loadoutMen: '', loadoutWomen: '', resultType: 'time', resultLabel: '',
  status: 'draft', startsAt: '', endsAt: '', xpReward: String(DEFAULT_CHALLENGE_XP),
};

function toInput(d: unknown): string {
  const dt = toDate(d);
  return dt ? new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
}
function fromInput(s: string): Timestamp | undefined {
  return s ? Timestamp.fromDate(new Date(s)) : undefined;
}

export default function AdminChallengesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Challenge | null | 'new'>(null);
  const [reviewing, setReviewing] = useState<Challenge | null>(null);

  const load = () => getChallenges().then(setList).catch(() => toast.error('Failed to load challenges')).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const remove = async (c: Challenge) => {
    if (!confirm(`Delete "${c.title}"? Entries and posts are lost. Closing it keeps the board.`)) return;
    try { await deleteChallenge(c.id); toast.success('Deleted'); load(); } catch { toast.error('Failed to delete'); }
  };
  const setStatus = async (c: Challenge, status: ChallengeStatus) => {
    try {
      await updateChallenge(c.id, { status });
      if (status === 'live') {
        // Everyone's phone, once. announcedAt on the server makes a second
        // Set live silent.
        const r = await announceChallenge(c.id).catch(() => null);
        toast.success(r?.alreadyAnnounced ? 'Live again — already announced, no second push' : `Live — pushed to ${r?.sent ?? 0} device${r?.sent === 1 ? '' : 's'}`);
      } else {
        toast.success(status === 'closed' ? 'Closed' : 'Back to draft');
      }
      load();
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 py-4 max-w-2xl mx-auto">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-text-secondary mb-4"><ChevronLeft className="w-4 h-4" /> Back</button>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-xl font-black text-white">Challenges</h1>
          <Button size="sm" onClick={() => setEditing('new')}><Plus className="w-4 h-4" /> New challenge</Button>
        </div>
        <p className="text-sm text-text-secondary mb-4">Draft it, set it live, verify results as they come in. Verified is what counts — for the board and the badge.</p>

        {loading ? (
          <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : list.length === 0 ? (
          <Card className="p-10 text-center"><p className="text-white font-bold">No challenges yet</p><p className="text-text-secondary text-sm mt-1">Create the first one.</p></Card>
        ) : (
          <div className="space-y-3">
            {list.map((c) => {
              const state = bucket(c);
              const pending = c.submissionCount - c.verifiedCount;
              return (
                <Card key={c.id} className="p-4 card-float">
                  <div className="flex items-start gap-3">
                    {c.media?.[0] ? (
                      c.media[0].type === 'video'
                        ? <video src={c.media[0].url} poster={c.media[0].posterURL} muted playsInline preload="metadata" className="w-16 h-20 rounded-xl object-cover bg-black flex-shrink-0" />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={c.media[0].url} alt="" className="w-16 h-20 rounded-xl object-cover flex-shrink-0" />
                    ) : <div className="w-16 h-20 rounded-xl bg-accent-muted flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white">{c.title}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${c.status === 'live' ? 'bg-accent text-black' : c.status === 'closed' ? 'bg-white/10 text-text-secondary' : 'bg-amber-400/20 text-amber-300'}`}>{c.status}</span>
                        {state !== c.status && state !== 'draft' && <span className="text-[10px] text-text-tertiary">({state})</span>}
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{c.brief}</p>
                      <div className="flex gap-3 text-xs text-text-tertiary mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.entryCount ?? 0}</span>
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {c.verifiedCount ?? 0} verified</span>
                        {pending > 0 && <span className="flex items-center gap-1 text-amber-300"><Clock className="w-3 h-3" /> {pending} to review</span>}
                        <span>{DIFFICULTY[c.difficulty]?.label}</span>
                        <span>{RESULT_TYPES.find((r) => r.id === c.resultType)?.label}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    <Button size="sm" variant="secondary" onClick={() => setReviewing(c)}><ShieldCheck className="w-3.5 h-3.5" /> Review{pending > 0 ? ` (${pending})` : ''}</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(c)}><Edit2 className="w-3.5 h-3.5" /> Edit</Button>
                    {c.status !== 'live' && <Button size="sm" onClick={() => setStatus(c, 'live')}>Set live</Button>}
                    {c.status === 'live' && <Button size="sm" variant="secondary" onClick={() => setStatus(c, 'closed')}>Close</Button>}
                    <button onClick={() => router.push(`/community/challenges/${c.id}`)} className="p-2 rounded-lg text-text-tertiary hover:text-white hover:bg-white/5" title="Open as a member"><ExternalLink className="w-4 h-4" /></button>
                    <button onClick={() => remove(c)} className="p-2 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger/10 ml-auto" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {editing && user && (
        <Editor
          challenge={editing === 'new' ? null : editing}
          uid={user.uid}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {reviewing && <Review challenge={reviewing} onClose={() => { setReviewing(null); load(); }} />}
    </div>
  );
}

function Editor({ challenge, uid, onClose, onSaved }: { challenge: Challenge | null; uid: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => challenge ? {
    title: challenge.title, brief: challenge.brief, rules: challenge.rules ?? '', category: challenge.category ?? '',
    difficulty: challenge.difficulty, media: challenge.media ?? [],
    loadoutMen: challenge.loadoutMen ?? '', loadoutWomen: challenge.loadoutWomen ?? '',
    resultType: challenge.resultType, resultLabel: challenge.resultLabel ?? '',
    status: challenge.status, startsAt: toInput(challenge.startsAt), endsAt: toInput(challenge.endsAt),
    xpReward: String(challenge.xpReward ?? DEFAULT_CHALLENGE_XP),
  } : EMPTY);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const ok = f.title.trim().length > 0 && f.brief.trim().length > 0;

  const save = async () => {
    if (!ok) return;
    setSaving(true);
    try {
      // Clips saved without a still open on a black frame on iPhone. The
      // picker grabs one in the background, but an admin who uploads six
      // slides and taps Create straight away beats it — so wait here.
      const media = await ensurePosters(f.media);
      const xp = Math.max(0, Math.min(5000, Math.round(Number(f.xpReward)) || 0));
      const input: ChallengeInput = {
        title: f.title.trim(), brief: f.brief.trim(),
        rules: f.rules.trim() || undefined, category: f.category.trim() || undefined,
        difficulty: f.difficulty, media, xpReward: xp,
        loadoutMen: f.loadoutMen.trim() || undefined, loadoutWomen: f.loadoutWomen.trim() || undefined,
        resultType: f.resultType, resultLabel: f.resultLabel.trim() || undefined,
        status: f.status, startsAt: fromInput(f.startsAt), endsAt: fromInput(f.endsAt),
      };
      let id = challenge?.id;
      if (challenge) await updateChallenge(challenge.id, input);
      else id = await createChallenge(input, uid);
      // Created straight into live: the push goes out now, same as Set live.
      if (!challenge && f.status === 'live' && id) await announceChallenge(id).catch(() => null);
      toast.success(challenge ? 'Saved' : f.status === 'live' ? 'Created and live — everyone pushed' : 'Created as a draft');
      onSaved();
    } catch (err) {
      console.error('[admin/challenges] save failed', err);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50';
  const label = 'text-xs text-text-secondary mb-1.5 block';

  return (
    <Modal open onClose={onClose} title={challenge ? 'Edit challenge' : 'New challenge'}
      footer={<div className="flex gap-2"><Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button><Button fullWidth onClick={save} loading={saving} disabled={!ok}>{challenge ? 'Save' : 'Create'}</Button></div>}>
      <div className="space-y-4">
        <div>
          <label className={label}>Carousel (up to {CAROUSEL_MAX}) — first frame is the cover</label>
          <MediaPicker value={f.media} onChange={(m) => set('media', m)} max={CAROUSEL_MAX} label="Add the slides" />
          {f.media.length > 1 && <div className="mt-2"><FeedCarousel items={f.media} compact className="!mt-0" /></div>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><label className={label}>Title</label><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="The 20 Ladder" className={inputCls} /></div>
          <div><label className={label}>Category</label><input value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Legs" className={inputCls} /></div>
        </div>
        <div><label className={label}>Brief — the hook, one or two lines</label><textarea value={f.brief} onChange={(e) => set('brief', e.target.value)} rows={2} placeholder="Climb from 1 rep to 20. Squats and lunges, back to back." className={`${inputCls} resize-none`} /></div>
        <div><label className={label}>Rules — the full thing</label><textarea value={f.rules} onChange={(e) => set('rules', e.target.value)} rows={5} placeholder={'1 squat + 1 lunge each leg, then 2 + 2… to 20.\nStuck? Rack it, breathe, finish the rung.'} className={`${inputCls} resize-none`} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Loadout · Men</label><textarea value={f.loadoutMen} onChange={(e) => set('loadoutMen', e.target.value)} rows={2} placeholder={'60 kg bar\n15–20 kg dumbbells'} className={`${inputCls} resize-none`} /></div>
          <div><label className={label}>Loadout · Women</label><textarea value={f.loadoutWomen} onChange={(e) => set('loadoutWomen', e.target.value)} rows={2} placeholder={'35 kg bar\n8–10 kg dumbbells'} className={`${inputCls} resize-none`} /></div>
        </div>
        <div>
          <label className={label}>Difficulty</label>
          <div className="flex gap-2">
            {(Object.keys(DIFFICULTY) as ChallengeDifficulty[]).map((d) => (
              <button key={d} type="button" onClick={() => set('difficulty', d)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${f.difficulty === d ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>{DIFFICULTY[d].label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className={label}>Result type</label>
          <div className="flex gap-2 flex-wrap">
            {RESULT_TYPES.map((r) => (
              <button key={r.id} type="button" onClick={() => set('resultType', r.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${f.resultType === r.id ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>{r.label}</button>
            ))}
          </div>
          <input value={f.resultLabel} onChange={(e) => set('resultLabel', e.target.value)} placeholder="Label over the input, e.g. Time to rung 20 (optional)" className={`${inputCls} mt-2`} />
        </div>
        <div>
          <label className={label}>XP for a verified finish</label>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={5000} step={10} value={f.xpReward} onChange={(e) => set('xpReward', e.target.value)} className={`${inputCls} w-32`} />
            <span className="text-xs text-text-tertiary">A workout is roughly 200–800 XP. {DEFAULT_CHALLENGE_XP} is the default; a brutal one can pay more.</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Starts (optional)</label><input type="datetime-local" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} className={inputCls} /></div>
          <div><label className={label}>Ends (optional)</label><input type="datetime-local" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} className={inputCls} /></div>
        </div>
        <div>
          <label className={label}>Status</label>
          <div className="flex gap-2">
            {(['draft', 'live', 'closed'] as ChallengeStatus[]).map((s) => (
              <button key={s} type="button" onClick={() => set('status', s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${f.status === s ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>{s}</button>
            ))}
          </div>
          <p className="text-[11px] text-text-tertiary mt-1.5">Draft: only admins see it. Live: members can enter and submit. Closed: board stays, no new entries.</p>
        </div>
      </div>
    </Modal>
  );
}

function Review({ challenge, onClose }: { challenge: Challenge; onClose: () => void }) {
  const [entries, setEntries] = useState<ChallengeEntry[]>([]);
  const [filter, setFilter] = useState<'submitted' | 'all'>('submitted');
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => subscribeEntries(challenge.id, setEntries), [challenge.id]);
  const shown = useMemo(() => {
    const list = filter === 'submitted' ? entries.filter((e) => e.status === 'submitted') : entries;
    return [...list].sort((a, b) => (toDate(b.submittedAt ?? b.enteredAt)?.getTime() ?? 0) - (toDate(a.submittedAt ?? a.enteredAt)?.getTime() ?? 0));
  }, [entries, filter]);

  const act = async (e: ChallengeEntry, fn: () => Promise<void>, msg: string) => {
    setBusy(e.id);
    try { await fn(); toast.success(msg); } catch (err) { console.error(err); toast.error('Action failed'); } finally { setBusy(null); }
  };
  const verify = (e: ChallengeEntry) => act(e, async () => {
    const r = await reviewChallengeEntry(challenge, e, 'verified');
    if (r.xpDelta > 0) toast.success(`+${r.xpDelta} XP${r.newAchievements.length ? ` · ${r.newAchievements.length} achievement${r.newAchievements.length > 1 ? 's' : ''}` : ''}`);
  }, `${e.displayName} verified`);
  const reject = (e: ChallengeEntry) => { setNoteFor(null); act(e, async () => { await reviewChallengeEntry(challenge, e, 'rejected', note); }, `${e.displayName} rejected`); setNote(''); };
  const reopen = (e: ChallengeEntry) => act(e, () => reopenEntry(challenge.id, e.userId), `${e.displayName} can submit again`);

  return (
    <Modal open onClose={onClose} title={`Review · ${challenge.title}`} className="max-w-2xl">
      <div className="flex gap-1.5 mb-3">
        {(['submitted', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${filter === f ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'}`}>
            {f === 'submitted' ? `To review (${entries.filter((e) => e.status === 'submitted').length})` : `All entries (${entries.length})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-8">{filter === 'submitted' ? 'Nothing waiting.' : 'Nobody has entered yet.'}</p>
      ) : (
        <div className="space-y-3">
          {shown.map((e) => (
            <Card key={e.id} className="p-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={e.displayName} src={e.photoURL} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{e.displayName}</p>
                  <p className="text-[11px] text-text-tertiary capitalize">{e.status}{e.submittedAt ? ` · ${toDate(e.submittedAt)?.toLocaleString()}` : ''}</p>
                </div>
                {e.result && <p className="text-base font-black text-white tabular-nums">{e.result}</p>}
              </div>
              {e.note && <p className="text-xs text-text-secondary mt-2 whitespace-pre-wrap">{e.note}</p>}
              {e.proof && e.proof.length > 0 && <FeedCarousel items={e.proof} />}
              {e.reviewNote && <p className="text-xs text-danger mt-2">Note sent: {e.reviewNote}</p>}
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {e.status !== 'verified' && e.status !== 'entered' && <Button size="sm" onClick={() => verify(e)} loading={busy === e.id}><ShieldCheck className="w-3.5 h-3.5" /> Verify</Button>}
                {e.status !== 'rejected' && e.status !== 'entered' && (
                  noteFor === e.id ? (
                    <div className="flex gap-1.5 w-full">
                      <input autoFocus value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Why (sent to them, optional)" className="flex-1 bg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white" />
                      <Button size="sm" variant="danger" onClick={() => reject(e)} loading={busy === e.id}>Reject</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setNoteFor(null); setNote(''); }}>Cancel</Button>
                    </div>
                  ) : <Button size="sm" variant="secondary" onClick={() => setNoteFor(e.id)}><XCircle className="w-3.5 h-3.5" /> Reject</Button>
                )}
                {e.status === 'rejected' && <Button size="sm" variant="secondary" onClick={() => reopen(e)} loading={busy === e.id}><RotateCcw className="w-3.5 h-3.5" /> Let them retry</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
}

