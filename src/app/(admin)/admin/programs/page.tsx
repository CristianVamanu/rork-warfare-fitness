'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit2, Trash2, EyeOff, Users, Sparkles, ChevronLeft, Dumbbell, Crown, Stethoscope, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getIdToken } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { getAllPrograms, deleteProgram, getAllUsers, enrollInProgram, getDeletedMockIds, permanentlyDeleteMockProgram, getPurgedMockIds, purgeMockProgram, getSystemConfig, updateProgram, upsertProgram } from '@/lib/firestore';
import { MOCK_PROGRAMS } from '@/lib/programs';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Program } from '@/types';

interface UserRow { id: string; displayName?: string; email?: string; activeProgram?: { programId?: string; programName?: string } }

interface HealthFinding {
  programId: string;
  programName: string;
  exerciseId: string;
  exerciseName: string;
  missingMuscleGroup: boolean;
  missingVideoMatch: boolean;
}

export default function ProgramsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [programs, setPrograms] = useState<(Program & { visibility?: string; _mock?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assignModal, setAssignModal] = useState<(Program & { visibility?: string }) | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [builtinsImported, setBuiltinsImported] = useState(true);
  const [importing, setImporting] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResult, setHealthResult] = useState<{ programsChecked: number; librarySize: number; findings: HealthFinding[] } | null>(null);
  const [deletingForever, setDeletingForever] = useState<string | null>(null);

  async function runHealthCheck() {
    if (!user) return;
    setHealthChecking(true);
    setHealthResult(null);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/program-health', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Health check failed');
      setHealthResult(data);
      if (data.findings.length === 0) toast.success('All exercises tagged and matched — no gaps found');
      else toast(`${data.findings.length} exercise${data.findings.length === 1 ? '' : 's'} need attention`, { icon: '⚠️' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setHealthChecking(false);
    }
  }

  useEffect(() => {
    Promise.all([
      getAllPrograms().catch(() => []),
      getAllUsers().catch(() => []),
      getDeletedMockIds().catch(() => [] as string[]),
      getPurgedMockIds().catch(() => [] as string[]),
      getSystemConfig().catch(() => null),
    ]).then(([progs, u, deletedIds, purgedIds, cfg]) => {
      const firestoreProgs = progs as (Program & { visibility?: string })[];
      const fpIds = new Set(firestoreProgs.map(p => p.id));
      // Deleted and purged both mean "gone" — a purge always writes the id to
      // deletedMocks as well, but reading both means an id recorded by only
      // one of them (an older delete, a half-failed write) still stays gone.
      const deleted = new Set([...(deletedIds as string[]), ...(purgedIds as string[])]);
      // One list, and it is the truth: every program here is live for clients.
      // There is no hidden state to reason about any more — the only way a
      // program leaves this list is Delete, and Delete is permanent.
      // After the import, the database holds every program and the bundled
      // copies are not consulted at all — so what is listed here is exactly
      // what exists, and Delete removes it outright.
      const imported = (cfg as { builtinsImported?: boolean } | null)?.builtinsImported === true;
      setBuiltinsImported(imported);
      const mocks = imported
        ? []
        : MOCK_PROGRAMS
            .filter(p => !fpIds.has(p.id) && !deleted.has(p.id))
            .map(p => ({ ...p, _mock: true }));
      setPrograms([...firestoreProgs, ...mocks]);
      setUsers((u as UserRow[]).filter((x: UserRow & { role?: string }) => x.role !== 'admin'));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Toggling premium/price on a built-in (mock) program promotes it to a
  // real Firestore doc in the same step — writing the mock's full content
  // plus the one changed field, via upsertProgram (merge:true, creates the
  // doc if it doesn't exist). No separate "edit and save it first" step;
  // the icon itself is the promotion action.
  async function handleSetPrice(p: Program & { _mock?: boolean }, price: number) {
    try {
      if (p._mock) {
        const { _mock, ...data } = p;
        void _mock;
        await upsertProgram(p.id, { ...data, price });
      } else {
        await updateProgram(p.id, { price });
      }
      setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, price, _mock: false } : x));
      toast.success(price > 0 ? `Price set to $${price.toFixed(2)}` : 'Price removed');
    } catch { toast.error('Failed to update price'); }
  }

  async function handleTogglePremium(p: Program & { _mock?: boolean }) {
    try {
      if (p._mock) {
        const { _mock, ...data } = p;
        void _mock;
        await upsertProgram(p.id, { ...data, isPremium: !p.isPremium });
      } else {
        await updateProgram(p.id, { isPremium: !p.isPremium });
      }
      setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, isPremium: !x.isPremium, _mock: false } : x));
      toast.success(p.isPremium ? 'Set to Free' : 'Set to Premium');
    } catch { toast.error('Failed to update'); }
  }

  async function handlePublish(p: Program) {
    setPublishing(p.id);
    try {
      await updateProgram(p.id, { isPublic: true, status: 'published' });
      setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, isPublic: true } : x));
      void revalidatePublicPrograms();
      toast.success('Program published — now visible to clients');
    } catch { toast.error('Failed to publish'); }
    finally { setPublishing(null); }
  }

  async function handleUnpublish(p: Program) {
    setPublishing(p.id);
    try {
      await updateProgram(p.id, { isPublic: false, status: 'draft' });
      setPrograms(prev => prev.map(x => x.id === p.id ? { ...x, isPublic: false } : x));
      void revalidatePublicPrograms();
      toast.success('Hidden — moved back to Draft, no longer visible to clients');
    } catch { toast.error('Failed to hide'); }
    finally { setPublishing(null); }
  }


  /**
   * Purges the cached public program pages. Fire-and-forget on purpose: the
   * public pages being stale for an hour is a small problem, a delete that
   * appears to fail because a cache purge failed is a worse one.
   */
  async function revalidatePublicPrograms() {
    try {
      if (!user) return;
      const token = await getIdToken(user);
      await fetch('/api/admin/revalidate-programs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* the 1h window is the fallback */ }
  }

  async function handleImportBuiltins() {
    if (!user) return;
    if (!confirm('Move the built-in programs into your database?\n\nAfter this they behave like any program you created: edit them, and Delete removes them completely. Programs you already deleted stay deleted.')) return;
    setImporting(true);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/admin/import-builtins', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      toast.success(`${data.imported} program${data.imported === 1 ? '' : 's'} moved into your database`);
      window.location.reload();
    } catch (e) { toast.error((e as Error).message); }
    finally { setImporting(false); }
  }

  async function handleDelete(p: Program & { _mock?: boolean }) {
    // One path for every program. Deleting a built-in used to mean "hide it
    // into a second list", which then had its own restore and its own
    // delete-forever — three steps to remove a program, and a leftover row
    // either way. Delete means delete.
    // Who is currently ON this program. The confirm used to say only "this
    // cannot be undone", which is true of the program and silent about the
    // members: an enrolled member's training screen falls back to the seed
    // copy if one exists and to "Program not found" if it doesn't, and either
    // way they have lost the thing they are paying for without being told.
    // Deleting is still allowed — it is the admin's call — but never blind.
    const onIt = users.filter((u) => u.activeProgram?.programId === p.id || (!u.activeProgram?.programId && u.activeProgram?.programName === p.name));
    const who = onIt.slice(0, 5).map((u) => u.displayName || u.email || u.id).join(', ') + (onIt.length > 5 ? ` and ${onIt.length - 5} more` : '');
    const warning = onIt.length > 0
      ? `\n\n⚠ ${onIt.length} member${onIt.length === 1 ? ' is' : 's are'} currently on this program: ${who}.\nAssign them a different program first (Assign → pick a member), or they will lose their plan.`
      : '';
    if (!confirm(`Delete "${p.name}"? This cannot be undone.${warning}`)) return;
    try {
      if (p._mock) {
        await permanentlyDeleteMockProgram(p.id);
        await purgeMockProgram(p.id);
      } else {
        await deleteProgram(p.id);
      }
      setPrograms(prev => prev.filter(x => x.id !== p.id));
      void revalidatePublicPrograms();
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
      {/* On phones the two action buttons crowded the title into a cramped
          squeeze — stack them on their own full-width row below the title
          instead; side by side with the title only from sm: up. */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-white/5 text-text-secondary hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-white">Programs</h1>
          <p className="text-xs text-text-secondary">{programs.length} total</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button size="sm" variant="secondary" className="flex-1 sm:flex-none" onClick={runHealthCheck} disabled={healthChecking}>
            <Stethoscope className="w-4 h-4" /> {healthChecking ? 'Checking...' : 'Health Check'}
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => router.push('/admin/programs/builder')}>
            <Sparkles className="w-4 h-4" /> Create with AI
          </Button>
        </div>
      </div>

      {/* Health check results — flags exercises missing a muscleGroup tag
          or with no matching video in the exerciseLibrary, checked live
          against real Firestore data since neither can be verified from
          the codebase alone. */}
      {healthResult && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Stethoscope className="w-4 h-4 text-accent" />
            <p className="text-sm font-bold text-white">
              Program Health — {healthResult.programsChecked} programs, {healthResult.librarySize} videos in library
            </p>
          </div>
          {healthResult.findings.length === 0 ? (
            <p className="text-sm text-text-secondary">Every exercise is tagged and has a matching video. No gaps found.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {healthResult.findings.map((f) => (
                <div key={`${f.programId}-${f.exerciseId}`} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-white/5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-white font-semibold">{f.exerciseName} <span className="text-text-tertiary font-normal">— {f.programName}</span></p>
                    <p className="text-text-secondary">
                      {[f.missingMuscleGroup && 'no muscle group tag', f.missingVideoMatch && 'no matching video'].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

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
                    {(p as { targetGender?: string }).targetGender && (p as { targetGender?: string }).targetGender !== 'anyone' && (
                      <Badge variant="muted">{(p as { targetGender?: string }).targetGender}</Badge>
                    )}
                    <span className="text-xs text-text-tertiary">{p.weeks}w · {p.daysPerWeek}d/wk</span>
                  </div>
                  {p.description && <p className="text-xs text-text-secondary mt-1.5 line-clamp-1">{p.description}</p>}
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
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!(p as { _mock?: boolean })._mock && !p.isPublic && p.visibility !== 'coaching' && p.visibility !== 'public' && (
                    <Button size="sm" onClick={() => handlePublish(p)} loading={publishing === p.id}>
                      Publish
                    </Button>
                  )}
                  {!(p as { _mock?: boolean })._mock && (p.isPublic || p.visibility === 'public') && (
                    <button
                      onClick={() => handleUnpublish(p)}
                      title="Hide (move back to Draft — no longer visible to clients)"
                      disabled={publishing === p.id}
                      className="p-2 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors disabled:opacity-50"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleTogglePremium(p)}
                    title={p.isPremium ? 'Set Free' : 'Set Premium'}
                    className={`p-2 rounded-lg transition-colors ${p.isPremium ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-text-secondary hover:text-yellow-400 hover:bg-yellow-400/10'}`}
                  >
                    <Crown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setAssignModal(p)}
                    title="Assign to client"
                    className="p-2 rounded-lg hover:bg-white/5 text-text-secondary hover:text-accent transition-colors"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => router.push(`/admin/programs/builder?id=${p.id}`)}
                    title={(p as { _mock?: boolean })._mock ? 'Edit (creates an editable copy)' : 'Edit'}
                    className="p-2 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {(p as { _mock?: boolean })._mock ? (
                    <button
                      onClick={() => handleDelete(p)}
                      title="Delete permanently"
                      className="p-2 rounded-lg hover:bg-white/5 text-text-secondary hover:text-white transition-colors"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDelete(p)}
                      title="Delete"
                      className="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!builtinsImported && (
        <Card className="p-4 mb-4 border-accent/30 space-y-2">
          <p className="text-sm font-bold text-white">Take full control of the built-in programs</p>
          <p className="text-xs text-text-secondary">
            The built-in programs live inside the app itself, which is why deleting one only ever
            hid it — every visitor still downloaded it. Move them into your database and that ends:
            Delete removes a program completely, and nothing is downloaded that you have deleted.
            Programs you have already deleted stay deleted.
          </p>
          <Button variant="secondary" onClick={handleImportBuiltins} loading={importing}>
            Move built-in programs into my database
          </Button>
        </Card>
      )}

      {programs.some((p) => !p._mock && !p.isPublic && p.visibility !== 'coaching' && p.visibility !== 'public') && (
        <Card className="p-4 mt-4">
          <p className="text-sm font-bold text-white mb-1">Hidden / Draft Programs</p>
          <p className="text-xs text-text-secondary mb-3">
            Unpublished — not visible to clients. Restore to publish them again.
          </p>
          <div className="space-y-2">
            {programs
              .filter((p) => !p._mock && !p.isPublic && p.visibility !== 'coaching' && p.visibility !== 'public')
              .map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-sm text-white">{p.name}</span>
                  <Button size="sm" variant="secondary" onClick={() => handlePublish(p)} loading={publishing === p.id}>
                    Restore
                  </Button>
                </div>
              ))}
          </div>
        </Card>
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
