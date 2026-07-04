'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit2, Trash2, Users, Sparkles, ChevronLeft, Dumbbell, Crown } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAllPrograms, deleteProgram, getAllUsers, enrollInProgram, getHiddenMockIds, hideMockProgram, updateProgram } from '@/lib/firestore';
import { MOCK_PROGRAMS } from '@/lib/programs';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Program } from '@/types';

interface UserRow { id: string; displayName?: string; email?: string; activeProgram?: { programName?: string } }

export default function ProgramsPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<(Program & { visibility?: string; _mock?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assignModal, setAssignModal] = useState<(Program & { visibility?: string }) | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getAllPrograms().catch(() => []),
      getAllUsers().catch(() => []),
      getHiddenMockIds().catch(() => [] as string[]),
    ]).then(([progs, u, hiddenIds]) => {
      const firestoreProgs = progs as (Program & { visibility?: string })[];
      const fpIds = new Set(firestoreProgs.map(p => p.id));
      const hidden = new Set(hiddenIds as string[]);
      const mocks = MOCK_PROGRAMS.filter(p => !fpIds.has(p.id) && !hidden.has(p.id)).map(p => ({ ...p, _mock: true }));
      setPrograms([...firestoreProgs, ...mocks]);
      setUsers((u as UserRow[]).filter((x: UserRow & { role?: string }) => x.role !== 'admin'));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function handleSetPrice(p: Program & { _mock?: boolean }, price: number) {
    if (p._mock) { toast.error('Built-in programs cannot be priced — duplicate it first.'); return; }
    try {
      await updateProgram(p.id, { price });
      setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, price } : x));
      toast.success(price > 0 ? `Price set to $${price.toFixed(2)}` : 'Price removed');
    } catch { toast.error('Failed to update price'); }
  }

  async function handleTogglePremium(p: Program & { _mock?: boolean }) {
    if (p._mock) { toast.error('Built-in programs cannot be toggled — duplicate it first.'); return; }
    try {
      await updateProgram(p.id, { isPremium: !p.isPremium });
      setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, isPremium: !x.isPremium } : x));
      toast.success(p.isPremium ? 'Set to Free' : 'Set to Premium');
    } catch { toast.error('Failed to update'); }
  }

  async function handlePublish(p: Program) {
    setPublishing(p.id);
    try {
      await updateProgram(p.id, { isPublic: true, status: 'published' });
      setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, isPublic: true } : x));
      toast.success('Program published — now visible to clients');
    } catch { toast.error('Failed to publish'); }
    finally { setPublishing(null); }
  }

  async function handleDelete(p: Program & { _mock?: boolean }) {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try {
      if (p._mock) {
        await hideMockProgram(p.id);
      } else {
        await deleteProgram(p.id);
      }
      setPrograms(prev => prev.filter(x => x.id !== p.id));
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  }

  async function handleAssign(u: UserRow) {
    if (!assignModal) return;
    setAssigning(u.id);
    try {
      await enrollInProgram(u.id, {
        id: assignModal.id,
        name: assignModal.name,
        weeks: assignModal.weeks,
        daysPerWeek: assignModal.daysPerWeek,
      });
      toast.success(`"${assignModal.name}" assigned to ${u.displayName}`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, activeProgram: { programName: assignModal.name } } : x));
    } catch { toast.error('Failed to assign'); }
    finally { setAssigning(null); }
  }

  const goalColor: Record<string, string> = {
    strength: 'accent', hypertrophy: 'info', endurance: 'success', 'weight-loss': 'danger', general: 'muted',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-white/5 text-text-secondary hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-black text-white">Programs</h1>
          <p className="text-xs text-text-secondary">{programs.length} total</p>
        </div>
        <Button onClick={() => router.push('/admin/programs/builder')}>
          <Sparkles className="w-4 h-4" /> Create with AI
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : programs.length === 0 ? (
        <Card className="p-10 text-center">
          <Dumbbell className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-white font-bold">No programs yet</p>
          <p className="text-text-secondary text-sm mt-1 mb-4">Use the AI builder to create your first program.</p>
          <Button onClick={() => router.push('/admin/programs/builder')}>
            <Sparkles className="w-4 h-4" /> Create with AI
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {programs.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-bold text-white">{p.name}</p>
                    {(p as { _mock?: boolean })._mock && <Badge variant="muted">Built-in</Badge>}
                    {p.visibility === 'coaching' && <Badge variant="danger">1:1 Coaching</Badge>}
                    {p.isPublic && !p.visibility && <Badge variant="accent">Public</Badge>}
                    {p.visibility === 'public' && <Badge variant="accent">Public</Badge>}
                    {!(p as { _mock?: boolean })._mock && !p.isPublic && p.visibility !== 'coaching' && p.visibility !== 'public' && (
                      <Badge variant="muted">Draft — not visible to clients</Badge>
                    )}
                    {p.isPremium && <Badge variant="info"><Crown className="w-3 h-3 inline mr-0.5" />Premium</Badge>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant={(goalColor[p.goal] || 'muted') as 'accent' | 'success' | 'danger' | 'info' | 'muted' | 'default'}>{p.goal}</Badge>
                    <Badge variant="muted">{p.level}</Badge>
                    <span className="text-xs text-text-tertiary">{p.weeks}w · {p.daysPerWeek}d/wk</span>
                  </div>
                  {p.description && <p className="text-xs text-text-secondary mt-1.5 line-clamp-1">{p.description}</p>}
                  {!(p as { _mock?: boolean })._mock && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-xs text-text-tertiary">One-time price:</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={p.price || ''}
                          placeholder="0"
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            if (v !== (p.price || 0)) handleSetPrice(p, v);
                          }}
                          className="w-20 bg-surface border border-white/10 rounded-lg pl-4 pr-1.5 py-1 text-xs text-white focus:outline-none focus:border-accent/50"
                        />
                      </div>
                      <span className="text-xs text-text-tertiary">(optional — lets clients buy this program without full membership)</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!(p as { _mock?: boolean })._mock && !p.isPublic && p.visibility !== 'coaching' && p.visibility !== 'public' && (
                    <Button size="sm" onClick={() => handlePublish(p)} loading={publishing === p.id}>
                      Publish
                    </Button>
                  )}
                  {!(p as { _mock?: boolean })._mock && (
                    <button
                      onClick={() => handleTogglePremium(p)}
                      title={p.isPremium ? 'Set Free' : 'Set Premium'}
                      className={`p-2 rounded-lg transition-colors ${p.isPremium ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-text-secondary hover:text-yellow-400 hover:bg-yellow-400/10'}`}
                    >
                      <Crown className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setAssignModal(p)}
                    title="Assign to client"
                    className="p-2 rounded-lg hover:bg-white/5 text-text-secondary hover:text-accent transition-colors"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                  {!(p as { _mock?: boolean })._mock && (
                    <button
                      onClick={() => router.push(`/admin/programs/builder?id=${p.id}`)}
                      title="Edit"
                      className="p-2 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(p)}
                    title="Delete"
                    className="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Assign modal */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Assign "${assignModal?.name}"`}>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {users.length === 0 && <p className="text-text-secondary text-sm text-center py-4">No clients found.</p>}
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => handleAssign(u)}
              disabled={!!assigning}
              className="w-full text-left p-3 bg-surface-elevated rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-bold">
                {u.displayName?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{u.displayName || 'Unknown'}</p>
                <p className="text-xs text-text-secondary truncate">{u.email}</p>
                {u.activeProgram?.programName && (
                  <p className="text-xs text-text-tertiary">Current: {u.activeProgram.programName}</p>
                )}
              </div>
              {assigning === u.id && <span className="text-xs text-accent">Assigning…</span>}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
