'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Flame, Copy, LogOut, Trophy, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  createSquad, subscribeMySquad, joinSquadByCode, leaveSquad, deleteSquad, getSquadLeaderboard,
} from '@/lib/firestore';
import type { Squad, SquadTier } from '@/types';
import { SQUAD_TIER_SIZE } from '@/types';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import toast from 'react-hot-toast';

const TIER_INFO: { tier: SquadTier; label: string; desc: string }[] = [
  { tier: 'duo', label: 'Duo', desc: '2 members' },
  { tier: 'trio', label: 'Trio', desc: '3 members' },
  { tier: 'squad', label: 'Squad', desc: 'Up to 5 members' },
];

export default function SquadsPage() {
  const { user } = useAuth();
  const [squad, setSquad] = useState<Squad | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [leaderboard, setLeaderboard] = useState<Squad[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [joinModal, setJoinModal] = useState(false);
  const [squadName, setSquadName] = useState('');
  const [tier, setTier] = useState<SquadTier>('duo');
  const [joinCode, setJoinCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeMySquad(user.uid, (s) => { setSquad(s); setLoading(false); });
    return unsub;
  }, [user]);

  useEffect(() => {
    getSquadLeaderboard(10).then(setLeaderboard).catch(() => {});
  }, [squad?.id, squad?.combinedStreak]);

  useEffect(() => {
    if (!squad) { setMemberNames({}); return; }
    Promise.all(squad.memberIds.map(async (id) => {
      const snap = await getDoc(doc(db, 'users', id));
      return [id, (snap.data()?.displayName as string) || 'Athlete'] as const;
    })).then((pairs) => setMemberNames(Object.fromEntries(pairs)));
  }, [squad]);

  const handleCreate = async () => {
    if (!user || !squadName.trim()) { toast.error('Give your squad a name'); return; }
    setSaving(true);
    try {
      await createSquad(squadName, tier, user.uid);
      toast.success('Squad created!');
      setCreateModal(false);
      setSquadName('');
    } catch {
      toast.error('Failed to create squad');
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async () => {
    if (!user || !joinCode.trim()) return;
    setSaving(true);
    try {
      await joinSquadByCode(joinCode, user.uid);
      toast.success('Joined squad!');
      setJoinModal(false);
      setJoinCode('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join squad');
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!user || !squad) return;
    try {
      await leaveSquad(squad.id, user.uid);
      toast.success('Left squad');
    } catch {
      toast.error('Failed to leave squad');
    }
  };

  const handleCopyCode = () => {
    if (!squad) return;
    navigator.clipboard?.writeText(squad.inviteCode).then(() => toast.success('Invite code copied!')).catch(() => {});
  };

  const handleDelete = async () => {
    if (!squad) return;
    setDeleting(true);
    try {
      await deleteSquad(squad.id);
      toast.success('Squad disbanded');
      setDeleteModal(false);
    } catch {
      toast.error('Failed to disband squad');
    } finally {
      setDeleting(false);
    }
  };

  const isOwner = !!user && squad?.ownerId === user.uid;

  return (
    <div>
      <Header title="Squads" showBack />
      <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto w-full">
        <p className="text-xs text-text-tertiary">
          Team up in a Duo, Trio, or Squad — your combined streak only grows on days <span className="text-white font-medium">every</span> member works out. Miss one day as a team and it resets.
        </p>

        {loading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : squad ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-5 bg-gradient-to-br from-surface to-surface-elevated border-accent/20">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-accent uppercase tracking-wider font-bold">{squad.tier}</p>
                  <p className="text-xl font-black text-white">{squad.name}</p>
                </div>
                <div className="flex items-center gap-1.5 text-orange-400">
                  <Flame className="w-6 h-6" />
                  <span className="text-2xl font-black">{squad.combinedStreak}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {squad.memberIds.map((id) => (
                  <span key={id} className="px-2.5 py-1 bg-white/5 rounded-lg text-xs text-white">
                    {memberNames[id] ?? '…'}{id === squad.ownerId ? ' 👑' : ''}
                  </span>
                ))}
                {Array.from({ length: squad.maxMembers - squad.memberIds.length }).map((_, i) => (
                  <span key={i} className="px-2.5 py-1 bg-white/5 rounded-lg text-xs text-text-tertiary border border-dashed border-white/10">
                    Open slot
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" fullWidth onClick={handleCopyCode}>
                  <Copy className="w-3.5 h-3.5" /> Invite Code: {squad.inviteCode}
                </Button>
                {isOwner ? (
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={() => setDeleteModal(true)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={handleLeave}>
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              {squad.bestStreak > squad.combinedStreak && (
                <p className="text-[11px] text-text-tertiary mt-2">Best ever: {squad.bestStreak} days</p>
              )}
            </Card>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button fullWidth onClick={() => setCreateModal(true)}>
              <Plus className="w-4 h-4" /> Create Squad
            </Button>
            <Button fullWidth variant="secondary" onClick={() => setJoinModal(true)}>
              <Users className="w-4 h-4" /> Join Squad
            </Button>
          </div>
        )}

        {/* Squad Leaderboard */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-accent" />
            <h2 className="text-base font-bold text-white">Top Squads</h2>
          </div>
          {leaderboard.length === 0 ? (
            <Card className="p-4 text-center">
              <p className="text-sm text-text-secondary">No squads yet — be the first!</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((s, i) => (
                <Card key={s.id} className={`p-3 flex items-center gap-3 ${s.id === squad?.id ? 'border-accent/40' : ''}`}>
                  <span className={`w-6 text-sm font-black flex-shrink-0 ${i === 0 ? 'text-accent' : 'text-text-tertiary'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{s.name}</p>
                    <p className="text-[10px] text-text-tertiary uppercase">{s.tier} · {s.memberIds.length}/{s.maxMembers}</p>
                  </div>
                  <div className="flex items-center gap-1 text-orange-400 flex-shrink-0">
                    <Flame className="w-3.5 h-3.5" /> <span className="text-sm font-bold">{s.combinedStreak}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Squad Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create a Squad">
        <div className="space-y-4">
          <Input value={squadName} onChange={(e) => setSquadName(e.target.value)} placeholder="Squad name" autoFocus />
          <div className="grid grid-cols-3 gap-2">
            {TIER_INFO.map((t) => (
              <button
                key={t.tier}
                onClick={() => setTier(t.tier)}
                className={`p-3 rounded-xl border text-center transition-colors ${
                  tier === t.tier ? 'border-accent bg-accent/10' : 'border-white/10 bg-surface'
                }`}
              >
                <p className="text-sm font-bold text-white">{t.label}</p>
                <p className="text-[10px] text-text-tertiary">{t.desc}</p>
              </button>
            ))}
          </div>
          <Button fullWidth loading={saving} onClick={handleCreate}>Create Squad</Button>
        </div>
      </Modal>

      {/* Join Squad Modal */}
      <Modal open={joinModal} onClose={() => setJoinModal(false)} title="Join a Squad">
        <div className="space-y-4">
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="6-character invite code"
            maxLength={6}
            autoFocus
          />
          <Button fullWidth loading={saving} onClick={handleJoin}>Join Squad</Button>
        </div>
      </Modal>

      {/* Disband Squad Confirmation */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Disband Squad?">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            This permanently deletes &ldquo;{squad?.name}&rdquo; for every member, including its combined streak history. This can&rsquo;t be undone.
          </p>
          <div className="flex gap-2">
            <Button fullWidth variant="ghost" onClick={() => setDeleteModal(false)}>Cancel</Button>
            <Button fullWidth loading={deleting} className="bg-red-500 hover:bg-red-600" onClick={handleDelete}>
              Disband
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
