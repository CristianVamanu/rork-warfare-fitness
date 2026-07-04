'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles, ChevronLeft, Plus, Trash2, ChevronUp, ChevronDown, Save,
  Users, CheckCircle, Loader2, Moon, Dumbbell, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getProgram, createProgram, updateProgram, getAllUsers, enrollInProgram,
} from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { Program } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BEx {
  id: string;
  name: string;
  muscleGroup: string;
  sets: number;
  reps: string;
  rpe: number;
  restSeconds: number;
  notes: string;
}

interface BDay {
  label: string;
  isRest: boolean;
  dayNote: string;
  exercises: BEx[];
}

interface BProg {
  name: string;
  description: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  goal: 'strength' | 'hypertrophy' | 'endurance' | 'weight-loss' | 'general';
  weeks: number;
  daysPerWeek: number;
  visibility: 'public' | 'coaching';
  schedule: BDay[];
}

interface UserRow { id: string; displayName?: string; email?: string; role?: string; activeProgram?: { programName?: string } }

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Cardio', 'Full Body', 'Other'];

function blankDay(label = 'Training Day'): BDay {
  return { label, isRest: false, dayNote: '', exercises: [] };
}

function restDay(): BDay {
  return { label: 'Rest', isRest: true, dayNote: '', exercises: [] };
}

function blankEx(): BEx {
  return { id: Math.random().toString(36).slice(2), name: '', muscleGroup: 'Chest', sets: 3, reps: '8-12', rpe: 8, restSeconds: 90, notes: '' };
}

function emptyProg(): BProg {
  return {
    name: '', description: '', level: 'intermediate', goal: 'hypertrophy',
    weeks: 8, daysPerWeek: 4, visibility: 'public',
    schedule: [blankDay('Push Day'), blankDay('Pull Day'), blankDay('Legs'), restDay(), blankDay('Upper Body'), restDay(), restDay()],
  };
}

// ─── Main component ────────────────────────────────────────────────────────────

function BuilderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = searchParams.get('id');
  const { user, profile } = useAuth();

  const [prog, setProg] = useState<BProg>(emptyProg());
  const [activeDay, setActiveDay] = useState(0);
  const [expandedEx, setExpandedEx] = useState<string | null>(null);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(programId);

  const [assignModal, setAssignModal] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  const [loading, setLoading] = useState(!!programId);

  // Load existing program for edit
  useEffect(() => {
    if (!programId) return;
    getProgram(programId)
      .then((p) => {
        if (!p) { toast.error('Program not found'); router.replace('/admin/programs'); return; }
        const program = p as unknown as Program & { visibility?: string; schedule?: BDay[] };
        setProg({
          name: program.name,
          description: program.description,
          level: program.level,
          goal: program.goal,
          weeks: program.weeks,
          daysPerWeek: program.daysPerWeek,
          visibility: (program.visibility as 'public' | 'coaching') ?? 'public',
          schedule: program.schedule?.length === 7
            ? program.schedule.map(d => ({
                ...d,
                dayNote: (d as BDay).dayNote || '',
                exercises: (d.exercises || []).map(e => ({
                  id: e.id || Math.random().toString(36).slice(2),
                  name: e.name,
                  muscleGroup: (e as BEx).muscleGroup || '',
                  sets: e.sets,
                  reps: String(e.reps),
                  rpe: (e as BEx).rpe || 8,
                  restSeconds: e.restSeconds,
                  notes: e.notes || '',
                })),
              }))
            : emptyProg().schedule,
        });
      })
      .catch(() => toast.error('Failed to load program'))
      .finally(() => setLoading(false));
  }, [programId, router]);

  // Load users for assign modal
  useEffect(() => {
    getAllUsers()
      .then(u => setUsers((u as UserRow[]).filter(x => x.role !== 'admin')))
      .catch(() => {});
  }, []);

  async function generateWithAI() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/generate-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      const p = data.program;

      setProg({
        name: p.name || '',
        description: p.description || '',
        level: p.level || 'intermediate',
        goal: p.goal || 'general',
        weeks: p.weeks || 8,
        daysPerWeek: p.daysPerWeek || 4,
        visibility: 'public',
        schedule: (p.schedule || []).map((d: BDay) => ({
          label: d.label || (d.isRest ? 'Rest' : 'Training Day'),
          isRest: !!d.isRest,
          dayNote: d.dayNote || '',
          exercises: (d.exercises || []).map((e: BEx) => ({
            id: Math.random().toString(36).slice(2),
            name: e.name || '',
            muscleGroup: e.muscleGroup || '',
            sets: Number(e.sets) || 3,
            reps: String(e.reps || '8-12'),
            rpe: Number(e.rpe) || 8,
            restSeconds: Number(e.restSeconds) || 90,
            notes: e.notes || '',
          })),
        })),
      });
      setAiGenerated(true);
      setActiveDay(0);
      toast.success('Program generated! Review and edit before saving.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSave(publish = false) {
    if (!prog.name.trim()) { toast.error('Program name required'); return; }
    if (!user) return;
    setSaving(true);
    try {
      const exercises = prog.schedule.flatMap(d => d.exercises);
      const unique = exercises.filter((e, i, arr) => arr.findIndex(x => x.name === e.name) === i);
      const data = {
        ...prog,
        isPublic: publish || prog.visibility === 'public',
        exercises: unique.map(e => ({ ...e, reps: e.reps })),
        createdBy: user.uid,
        trainerId: user.uid,
        status: publish ? 'published' : 'draft',
      };
      if (savedId) {
        await updateProgram(savedId, data);
        toast.success(publish ? 'Program published!' : 'Changes saved');
      } else {
        const ref = await createProgram(data);
        setSavedId(ref.id);
        toast.success(publish ? 'Program published!' : 'Draft saved');
      }
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  }

  async function handleAssign(u: UserRow) {
    if (!savedId || !prog.name) { toast.error('Save the program first'); return; }
    setAssigning(u.id);
    try {
      await enrollInProgram(u.id, { id: savedId, name: prog.name, weeks: prog.weeks, daysPerWeek: prog.daysPerWeek });
      toast.success(`"${prog.name}" assigned to ${u.displayName}`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, activeProgram: { programName: prog.name } } : x));
    } catch { toast.error('Failed to assign'); }
    finally { setAssigning(null); }
  }

  // ── Day helpers ───────────────────────────────────────────────────────────

  function setDay(i: number, patch: Partial<BDay>) {
    setProg(s => ({ ...s, schedule: s.schedule.map((d, j) => j === i ? { ...d, ...patch } : d) }));
  }

  function toggleRest(i: number) {
    const day = prog.schedule[i];
    if (day.isRest) {
      setDay(i, { isRest: false, label: 'Training Day', exercises: [] });
    } else {
      setDay(i, { isRest: true, label: 'Rest', exercises: [] });
    }
  }

  function addExercise(dayIdx: number) {
    const ex = blankEx();
    setDay(dayIdx, { exercises: [...prog.schedule[dayIdx].exercises, ex] });
    setExpandedEx(ex.id);
  }

  function removeExercise(dayIdx: number, exId: string) {
    setDay(dayIdx, { exercises: prog.schedule[dayIdx].exercises.filter(e => e.id !== exId) });
    if (expandedEx === exId) setExpandedEx(null);
  }

  function updateEx(dayIdx: number, exId: string, patch: Partial<BEx>) {
    setDay(dayIdx, { exercises: prog.schedule[dayIdx].exercises.map(e => e.id === exId ? { ...e, ...patch } : e) });
  }

  function moveEx(dayIdx: number, exId: string, dir: -1 | 1) {
    const exs = [...prog.schedule[dayIdx].exercises];
    const i = exs.findIndex(e => e.id === exId);
    const j = i + dir;
    if (j < 0 || j >= exs.length) return;
    [exs[i], exs[j]] = [exs[j], exs[i]];
    setDay(dayIdx, { exercises: exs });
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const day = prog.schedule[activeDay];

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-white/5 text-text-secondary hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-white">{programId ? 'Edit Program' : 'Program Builder'}</h1>
          <p className="text-xs text-text-secondary">{savedId ? (prog.visibility === 'coaching' ? 'Coaching program (private)' : 'Public program') : 'Unsaved draft'}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => handleSave(false)} loading={saving}>
            <Save className="w-3.5 h-3.5" /> Save
          </Button>
          <Button size="sm" onClick={() => handleSave(true)} loading={saving}>
            Publish
          </Button>
        </div>
      </div>

      {/* AI Generation */}
      <Card className="p-5 border-accent/20 bg-accent/5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-bold text-white">AI Program Generator</h2>
          {aiGenerated && <Badge variant="accent">Generated</Badge>}
        </div>
        <p className="text-xs text-text-secondary mb-3">
          Describe the program and AI will build a complete weekly schedule with exercises, sets, reps, RPE, and rest times. You can edit everything after.
        </p>
        <div className="space-y-2">
          <textarea
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            placeholder="e.g. Create a 12-week powerlifting program for an intermediate male, 4 days/week (upper/lower split), focused on squat/bench/deadlift with accessory work. Include deload week every 4th week."
            rows={3}
            className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
          />
          <Button
            fullWidth
            onClick={generateWithAI}
            loading={aiLoading}
            disabled={!aiPrompt.trim()}
          >
            {aiLoading ? 'Generating program…' : <><Sparkles className="w-4 h-4" /> Generate with AI</>}
          </Button>
        </div>
        {aiGenerated && (
          <p className="text-xs text-accent mt-2 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> AI has filled the program below. Review and edit before saving.
          </p>
        )}
      </Card>

      {/* Metadata */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-white">Program Details</h2>
        <div>
          <label className="text-xs text-text-secondary mb-1 block">Program Name *</label>
          <Input
            value={prog.name}
            onChange={e => setProg(s => ({ ...s, name: e.target.value }))}
            placeholder="e.g. 12-Week Strength Foundation"
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary mb-1 block">Description</label>
          <textarea
            value={prog.description}
            onChange={e => setProg(s => ({ ...s, description: e.target.value }))}
            placeholder="What's this program about? Who is it for?"
            rows={2}
            className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Level</label>
            <select
              value={prog.level}
              onChange={e => setProg(s => ({ ...s, level: e.target.value as BProg['level'] }))}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Goal</label>
            <select
              value={prog.goal}
              onChange={e => setProg(s => ({ ...s, goal: e.target.value as BProg['goal'] }))}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
            >
              <option value="general">General Fitness</option>
              <option value="strength">Strength</option>
              <option value="hypertrophy">Hypertrophy</option>
              <option value="weight-loss">Weight Loss</option>
              <option value="endurance">Endurance</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Duration (weeks)</label>
            <Input
              type="number"
              value={prog.weeks}
              onChange={e => setProg(s => ({ ...s, weeks: Math.max(1, Number(e.target.value)) }))}
              min={1} max={52}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Days per week</label>
            <Input
              type="number"
              value={prog.daysPerWeek}
              onChange={e => setProg(s => ({ ...s, daysPerWeek: Math.min(7, Math.max(1, Number(e.target.value))) }))}
              min={1} max={7}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-text-secondary mb-2 block">Visibility</label>
          <div className="flex gap-2">
            {(['public', 'coaching'] as const).map(v => (
              <button
                key={v}
                onClick={() => setProg(s => ({ ...s, visibility: v }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  prog.visibility === v
                    ? 'bg-accent text-black border-accent'
                    : 'bg-surface border-white/10 text-text-secondary hover:text-white'
                }`}
              >
                {v === 'public' ? '🌐 Public' : '🔒 1:1 Coaching'}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-tertiary mt-1.5">
            {prog.visibility === 'public'
              ? 'All users can browse and enroll in this program.'
              : 'Only users you assign this program to can access it. For 1-to-1 coaching clients.'}
          </p>
        </div>
      </Card>

      {/* Weekly Schedule Builder */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-white mb-4">Weekly Schedule</h2>

        {/* Day tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {DOW.map((d, i) => {
            const isRest = prog.schedule[i]?.isRest;
            return (
              <button
                key={d}
                onClick={() => setActiveDay(i)}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-xl min-w-[44px] transition-all ${
                  activeDay === i
                    ? 'bg-accent text-black'
                    : isRest
                    ? 'bg-surface-elevated text-text-tertiary border border-white/5'
                    : 'bg-surface-elevated text-white border border-white/10 hover:border-accent/30'
                }`}
              >
                <span className="text-xs font-bold">{d}</span>
                {isRest ? <Moon className="w-3 h-3" /> : <Dumbbell className="w-3 h-3" />}
              </button>
            );
          })}
        </div>

        {/* Active day editor */}
        <div className="space-y-3">
          {/* Day header */}
          <div className="flex items-center gap-3">
            <input
              value={day.isRest ? 'Rest Day' : day.label}
              onChange={e => setDay(activeDay, { label: e.target.value })}
              disabled={day.isRest}
              placeholder="Day label e.g. Push Day"
              className="flex-1 bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 disabled:opacity-40"
            />
            <button
              onClick={() => toggleRest(activeDay)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                day.isRest
                  ? 'bg-blue-400/10 border-blue-400/30 text-blue-400'
                  : 'bg-surface border-white/10 text-text-secondary hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              {day.isRest ? 'Rest Day' : 'Set Rest'}
            </button>
          </div>

          {!day.isRest && (
            <input
              value={day.dayNote}
              onChange={e => setDay(activeDay, { dayNote: e.target.value })}
              placeholder="Coaching note for this day (optional)"
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-text-secondary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
            />
          )}

          {day.isRest ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-tertiary gap-2">
              <Moon className="w-8 h-8" />
              <p className="text-sm">Rest day — recovery and adaptation</p>
            </div>
          ) : (
            <>
              {/* Exercises */}
              <div className="space-y-2">
                {day.exercises.length === 0 && (
                  <div className="flex items-center gap-2 p-3 bg-surface-elevated rounded-xl text-text-tertiary text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    No exercises yet. Add one below or generate with AI.
                  </div>
                )}
                {day.exercises.map((ex, exIdx) => (
                  <div key={ex.id} className="bg-surface-elevated rounded-xl overflow-hidden border border-white/5">
                    {/* Exercise header - always visible */}
                    <div
                      className="flex items-center gap-2 p-3 cursor-pointer"
                      onClick={() => setExpandedEx(expandedEx === ex.id ? null : ex.id)}
                    >
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={e => { e.stopPropagation(); moveEx(activeDay, ex.id, -1); }}
                          disabled={exIdx === 0}
                          className="p-0.5 hover:text-white text-text-tertiary disabled:opacity-20 transition-colors"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); moveEx(activeDay, ex.id, 1); }}
                          disabled={exIdx === day.exercises.length - 1}
                          className="p-0.5 hover:text-white text-text-tertiary disabled:opacity-20 transition-colors"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{ex.name || 'Untitled Exercise'}</p>
                        <p className="text-xs text-text-secondary">
                          {ex.sets}×{ex.reps} · RPE {ex.rpe} · {ex.restSeconds}s rest
                          {ex.muscleGroup ? ` · ${ex.muscleGroup}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); removeExercise(activeDay, ex.id); }}
                        className="p-1.5 rounded-lg hover:bg-danger/10 text-text-tertiary hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Expanded form */}
                    {expandedEx === ex.id && (
                      <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <label className="text-[10px] text-text-tertiary mb-1 block">Exercise Name</label>
                            <Input
                              value={ex.name}
                              onChange={e => updateEx(activeDay, ex.id, { name: e.target.value })}
                              placeholder="e.g. Barbell Back Squat"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-text-tertiary mb-1 block">Muscle Group</label>
                            <select
                              value={ex.muscleGroup}
                              onChange={e => updateEx(activeDay, ex.id, { muscleGroup: e.target.value })}
                              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
                            >
                              {MUSCLE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-text-tertiary mb-1 block">Sets</label>
                            <Input
                              type="number"
                              value={ex.sets}
                              onChange={e => updateEx(activeDay, ex.id, { sets: Math.max(1, Number(e.target.value)) })}
                              min={1} max={20}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-text-tertiary mb-1 block">Reps / Range</label>
                            <Input
                              value={ex.reps}
                              onChange={e => updateEx(activeDay, ex.id, { reps: e.target.value })}
                              placeholder="e.g. 5 or 8-12"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-text-tertiary mb-1 block">RPE ({ex.rpe}/10)</label>
                            <input
                              type="range"
                              min={1} max={10} step={0.5}
                              value={ex.rpe}
                              onChange={e => updateEx(activeDay, ex.id, { rpe: Number(e.target.value) })}
                              className="w-full accent-yellow-400 mt-2"
                            />
                            <div className="flex justify-between text-[10px] text-text-tertiary mt-0.5">
                              <span>Easy</span><span>Max</span>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-text-tertiary mb-1 block">Rest (seconds)</label>
                            <Input
                              type="number"
                              value={ex.restSeconds}
                              onChange={e => updateEx(activeDay, ex.id, { restSeconds: Math.max(0, Number(e.target.value)) })}
                              min={0} max={600} step={15}
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-text-tertiary mb-1 block">Exercise Tip (shown to user during workout)</label>
                            <Input
                              value={ex.notes}
                              onChange={e => updateEx(activeDay, ex.id, { notes: e.target.value })}
                              placeholder="e.g. Keep chest up, drive through heels"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => addExercise(activeDay)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/20 text-text-secondary hover:text-white hover:border-white/40 text-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Exercise
              </button>
            </>
          )}
        </div>
      </Card>

      {/* Week overview summary */}
      <Card className="p-4">
        <h2 className="text-sm font-bold text-white mb-3">Week Overview</h2>
        <div className="grid grid-cols-7 gap-1">
          {DOW.map((d, i) => {
            const s = prog.schedule[i];
            return (
              <button
                key={d}
                onClick={() => setActiveDay(i)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg text-[10px] transition-colors ${
                  activeDay === i ? 'bg-accent text-black' : s?.isRest ? 'bg-surface-elevated text-text-tertiary' : 'bg-surface-elevated text-white hover:bg-white/10'
                }`}
              >
                <span className="font-bold">{d}</span>
                {s?.isRest ? (
                  <Moon className="w-3 h-3" />
                ) : (
                  <span className="text-[9px] text-center leading-tight">{s?.label}</span>
                )}
                {!s?.isRest && <span className="font-bold">{s?.exercises.length}ex</span>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Assign to clients */}
      {savedId && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Assign to Clients</h2>
            <Button size="sm" variant="secondary" onClick={() => setAssignModal(true)}>
              <Users className="w-3.5 h-3.5" /> Assign
            </Button>
          </div>
          <p className="text-xs text-text-secondary">
            {prog.visibility === 'coaching'
              ? 'This is a private 1:1 coaching program. Assign it directly to specific clients.'
              : 'This is a public program. Clients can self-enroll, or you can assign it directly.'}
          </p>
        </Card>
      )}

      {!savedId && (
        <div className="flex items-center gap-2 p-3 bg-yellow-400/10 border border-yellow-400/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <p className="text-xs text-yellow-400">Save the program first before assigning it to clients.</p>
        </div>
      )}

      {/* Assign modal */}
      <Modal open={assignModal} onClose={() => setAssignModal(false)} title={`Assign "${prog.name}" to client`}>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {users.length === 0 && <p className="text-text-secondary text-sm text-center py-4">No clients yet.</p>}
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => handleAssign(u)}
              disabled={assigning === u.id}
              className="w-full text-left p-3 bg-surface-elevated rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                {u.displayName?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{u.displayName || 'Unknown'}</p>
                <p className="text-xs text-text-secondary truncate">{u.email}</p>
                {u.activeProgram?.programName && (
                  <p className="text-xs text-text-tertiary">Current: {u.activeProgram.programName}</p>
                )}
              </div>
              {assigning === u.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
              ) : (
                <CheckCircle className="w-4 h-4 text-text-tertiary" />
              )}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>}>
      <BuilderInner />
    </Suspense>
  );
}
