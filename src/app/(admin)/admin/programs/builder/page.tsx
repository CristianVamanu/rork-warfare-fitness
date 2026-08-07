'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Sparkles, ChevronLeft, Plus, Trash2, ChevronUp, ChevronDown, Save,
  Users, CheckCircle, Loader2, Moon, Dumbbell, AlertCircle, Video, Search, X, Play, Upload, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getProgram, createProgram, updateProgram, upsertProgram, getAllUsers, enrollInProgram,
  matchExercisesToVideos, getExerciseVideos, getSystemConfig, saveExerciseVideo,
} from '@/lib/firestore';
import { getMockProgram } from '@/lib/programs';
import { parseDistance } from '@/lib/distance';
import { uploadVideo, type StorageProvider } from '@/lib/uploadVideo';
import { extractVideoThumbnail } from '@/lib/videoThumbnail';
import { getIdToken } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { Program, ExerciseVideo } from '@/types';
import { stripUndefinedDeep } from '@/lib/utils';

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
  videoUrl?: string;
  isCardio?: boolean;
  cardioDurationSeconds?: number;
  isHiit?: boolean;
  hiitWorkSeconds?: number;
  hiitRestSeconds?: number;
  hiitRounds?: number;
}

interface BDay {
  label: string;
  isRest: boolean;
  dayNote: string;
  exercises: BEx[];
}

// A week-ranged block (e.g. "Weeks 1-4: Base Building") with its own 7-day
// schedule — lets a long program vary what it trains over time instead of
// one template repeating for the whole thing. `phases` stays empty for a
// simple single-template program; `schedule` below is still what's edited
// directly in that case, kept in sync with phases[0] only once phases exist.
interface BPhase {
  id: string;
  label: string;
  startWeek: number;
  endWeek: number;
  schedule: BDay[];
}

interface BProg {
  name: string;
  description: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  goal: 'strength' | 'hypertrophy' | 'endurance' | 'weight-loss' | 'general';
  weeks: number;
  daysPerWeek: number;
  visibility: 'public' | 'coaching';
  targetGender: 'male' | 'female' | 'anyone';
  imageUrl: string;
  schedule: BDay[];
  phases: BPhase[];
}

interface UserRow { id: string; displayName?: string; email?: string; role?: string; activeProgram?: { programName?: string } }

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core', 'Cardio', 'Full Body', 'Other'];

// Program data (seed programs + some admin-created ones) stores muscleGroup
// as lowercase/hyphenated ('legs', 'full-body') while this form's <select>
// only offers Title Case options ('Legs', 'Full Body') — when a <select>'s
// value doesn't match any of its options, the browser silently falls back
// to displaying the FIRST option ("Chest"), which made every exercise in
// every built-in program look mistagged as chest once opened for editing.
// This normalizes on load so the dropdown actually reflects the real tag.
const MUSCLE_GROUP_ALIASES: Record<string, string> = {
  legs: 'Legs', hamstrings: 'Legs', quads: 'Legs', glutes: 'Glutes',
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', arms: 'Triceps',
  core: 'Core', cardio: 'Cardio', 'full-body': 'Full Body', fullbody: 'Full Body',
};

function normalizeMuscleGroup(mg: string | undefined): string {
  if (!mg) return '';
  if (MUSCLE_GROUPS.includes(mg)) return mg;
  return MUSCLE_GROUP_ALIASES[mg.toLowerCase().trim()] ?? 'Other';
}

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
    weeks: 8, daysPerWeek: 4, visibility: 'public', targetGender: 'anyone', imageUrl: '',
    schedule: [blankDay('Push Day'), blankDay('Pull Day'), blankDay('Legs'), restDay(), blankDay('Upper Body'), restDay(), restDay()],
    phases: [],
  };
}

function blankPhase(label: string, startWeek: number, endWeek: number, schedule: BDay[]): BPhase {
  return { id: Math.random().toString(36).slice(2), label, startWeek, endWeek, schedule };
}

// A plain (non-HIIT) cardio exercise's on-screen timer length always comes
// from cardioDurationSeconds — the session player only falls back to
// treating the "Reps" field as whole minutes when that's unset. This
// builder previously had no control for cardioDurationSeconds at all, so
// admins typed a duration into Reps expecting seconds and got minutes
// instead (e.g. a 30-second plank became a 30-minute timer). Lets the
// admin type in whichever unit is natural (seconds for a HIIT-style
// finisher, minutes for a walk/run) and always stores the true seconds
// value regardless of which unit is currently selected.
function CardioDurationInput({ valueSeconds, onChange }: { valueSeconds: number; onChange: (seconds: number) => void }) {
  const [unit, setUnit] = useState<'sec' | 'min'>(valueSeconds >= 60 && valueSeconds % 60 === 0 ? 'min' : 'sec');
  const amount = unit === 'min' ? Math.round(valueSeconds / 60) : valueSeconds;

  return (
    <div className="flex gap-2">
      <Input
        type="number"
        min={1}
        value={amount}
        onChange={e => onChange(Math.max(1, Number(e.target.value)) * (unit === 'min' ? 60 : 1))}
        className="flex-1"
      />
      <select
        value={unit}
        onChange={e => {
          const newUnit = e.target.value as 'sec' | 'min';
          setUnit(newUnit);
          // Re-express the currently displayed amount in the new unit's
          // seconds so switching units doesn't silently change the
          // duration (e.g. "30" showing under "sec" becoming "30 min").
          onChange(newUnit === 'min' ? amount * 60 : amount);
        }}
        className="bg-surface border border-white/10 rounded-xl px-2 text-sm text-white focus:outline-none focus:border-accent/50"
      >
        <option value="sec">sec</option>
        <option value="min">min</option>
      </select>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

function BuilderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = searchParams.get('id');
  const { user, profile } = useAuth();

  const [prog, setProg] = useState<BProg>(emptyProg());
  const [activeDay, setActiveDay] = useState(0);
  const [activePhase, setActivePhase] = useState(0);
  const [expandedEx, setExpandedEx] = useState<string | null>(null);
  // Explicit per-exercise Timed/Distance mode for cardio exercises — can't
  // be derived purely from whether `reps` currently parses as a distance,
  // because an empty/in-progress distance string ("", "5") doesn't parse
  // either, which made the toggle look broken: clicking "Distance" cleared
  // reps to '' expecting the view to switch, but '' isn't a valid distance
  // so the derived mode silently stayed "Timed" and nothing appeared to happen.
  const [cardioModeOverride, setCardioModeOverride] = useState<Record<string, 'timed' | 'distance'>>({});

  // Every day-editing helper below reads/writes through these two functions
  // instead of touching prog.schedule directly, so the exact same editor UI
  // works whether the program has phases or not — with no phases, they're a
  // thin passthrough to prog.schedule (today's behavior, unchanged).
  const activeSchedule: BDay[] = prog.phases.length > 0
    ? (prog.phases[activePhase]?.schedule ?? [])
    : prog.schedule;

  function setActiveSchedule(updater: (schedule: BDay[]) => BDay[]) {
    setProg((s) => {
      if (s.phases.length > 0) {
        return {
          ...s,
          phases: s.phases.map((p, i) => i === activePhase ? { ...p, schedule: updater(p.schedule) } : p),
        };
      }
      return { ...s, schedule: updater(s.schedule) };
    });
  }

  function addPhase() {
    setProg((s) => {
      if (s.phases.length === 0) {
        // First split: divide the program's current week range roughly in
        // half. Phase 2 starts as a copy of phase 1's schedule (a later
        // block usually evolves from the one before it, not a blank
        // template) — the admin then edits whichever weeks should differ.
        const mid = Math.max(1, Math.ceil(s.weeks / 2));
        const phase1 = blankPhase('Phase 1', 1, mid, s.schedule);
        const phase2 = blankPhase('Phase 2', Math.min(mid + 1, s.weeks), s.weeks, JSON.parse(JSON.stringify(s.schedule)));
        setActivePhase(1);
        return { ...s, phases: [phase1, phase2] };
      }
      const last = s.phases[s.phases.length - 1];
      // No room after the last phase → shrink it by half its range to make
      // space, rather than creating an out-of-range phase that save-time
      // validation would then reject with a confusing error.
      if (last.endWeek >= s.weeks) {
        const shrunkEnd = Math.max(last.startWeek, last.endWeek - Math.max(1, Math.floor((last.endWeek - last.startWeek + 1) / 2)));
        if (shrunkEnd >= s.weeks) {
          toast.error('No weeks left for a new phase — lengthen the program or shorten an existing phase first');
          return s;
        }
        const newPhase = blankPhase(`Phase ${s.phases.length + 1}`, shrunkEnd + 1, s.weeks, JSON.parse(JSON.stringify(last.schedule)));
        setActivePhase(s.phases.length);
        return {
          ...s,
          phases: [...s.phases.slice(0, -1), { ...last, endWeek: shrunkEnd }, newPhase],
        };
      }
      const startWeek = last.endWeek + 1;
      const newPhase = blankPhase(`Phase ${s.phases.length + 1}`, startWeek, s.weeks, JSON.parse(JSON.stringify(last.schedule)));
      setActivePhase(s.phases.length);
      return { ...s, phases: [...s.phases, newPhase] };
    });
  }

  function removePhase(idx: number) {
    setProg((s) => {
      if (s.phases.length <= 1) return s; // last phase can't be removed via this button — see collapsePhases
      const phases = s.phases.filter((_, i) => i !== idx);
      setActivePhase((p) => Math.min(p, phases.length - 1));
      return { ...s, phases };
    });
  }

  function updatePhase(idx: number, patch: Partial<Pick<BPhase, 'label' | 'startWeek' | 'endWeek'>>) {
    setProg((s) => ({ ...s, phases: s.phases.map((p, i) => i === idx ? { ...p, ...patch } : p) }));
  }

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDoc, setAiDoc] = useState<{ name: string; text: string; truncated: boolean } | null>(null);
  const [aiDocExtracting, setAiDocExtracting] = useState(false);
  const aiDocInputRef = useRef<HTMLInputElement>(null);
  const [aiGenerated, setAiGenerated] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(programId);
  const [editingBuiltIn, setEditingBuiltIn] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingImage(true);
    try {
      const cfg = await getSystemConfig().catch(() => null);
      const provider = ((cfg?.storageProvider as StorageProvider) || 'firebase');
      const url = await uploadVideo(provider, user, file, 'programImages');
      setProg((s) => ({ ...s, imageUrl: url }));
      toast.success('Cover image uploaded');
    } catch (err) {
      toast.error(`Failed to upload image: ${err instanceof Error ? err.message : String(err)}`, { duration: 6000 });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  }

  const [assignModal, setAssignModal] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  const [videoPickerFor, setVideoPickerFor] = useState<string | null>(null);
  const [videoLibrary, setVideoLibrary] = useState<ExerciseVideo[]>([]);
  const [videoLibraryLoading, setVideoLibraryLoading] = useState(false);
  const [videoSearch, setVideoSearch] = useState('');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [uploadingNewVideo, setUploadingNewVideo] = useState(false);
  const [newVideoUploadProgress, setNewVideoUploadProgress] = useState(0);

  const [loading, setLoading] = useState(!!programId);

  // Load existing program for edit — falls back to the built-in seed
  // programs (MOCK_PROGRAMS) when Firestore has no doc at this id yet, so
  // editing one of the shipped-in-code programs works the same as editing
  // an admin-created one. Saving writes a real Firestore doc under the same
  // id (see handleSave/upsertProgram), which then transparently overrides
  // the seed version everywhere it's looked up.
  interface LoadedProgram {
    name: string; description: string; level: BProg['level']; goal: BProg['goal'];
    weeks: number; daysPerWeek: number; visibility?: string; targetGender?: BProg['targetGender']; imageUrl?: string;
    schedule?: BDay[];
    phases?: { id: string; label: string; startWeek: number; endWeek: number; schedule: BDay[] }[];
  }

  useEffect(() => {
    // Navigating between programs in the builder reuses this same component
    // instance (only `programId` changes) rather than remounting — without
    // this, an AI prompt/uploaded document attached while generating one
    // program would silently persist and get sent along with the next,
    // unrelated program's generation.
    setAiPrompt('');
    setAiDoc(null);
    setAiGenerated(false);
    if (!programId) return;
    getProgram(programId)
      .then((p) => {
        if (!p) {
          const mock = getMockProgram(programId);
          if (!mock) { toast.error('Program not found'); router.replace('/admin/programs'); return; }
          setEditingBuiltIn(true);
          return mock as unknown as LoadedProgram;
        }
        return p as unknown as LoadedProgram;
      })
      .then(async (program) => {
        if (!program) return;

        const hydrateSchedule = (raw?: BDay[]): BDay[] => raw?.length === 7
          ? raw.map(d => ({
              ...d,
              dayNote: (d as BDay).dayNote || '',
              exercises: (d.exercises || []).map(e => ({
                id: e.id || Math.random().toString(36).slice(2),
                name: e.name,
                muscleGroup: normalizeMuscleGroup((e as BEx).muscleGroup),
                sets: e.sets,
                reps: String(e.reps),
                rpe: (e as BEx).rpe || 8,
                restSeconds: e.restSeconds,
                notes: e.notes || '',
                isCardio: (e as BEx).isCardio,
                cardioDurationSeconds: (e as BEx).cardioDurationSeconds,
                isHiit: (e as BEx).isHiit,
                hiitWorkSeconds: (e as BEx).hiitWorkSeconds,
                hiitRestSeconds: (e as BEx).hiitRestSeconds,
                hiitRounds: (e as BEx).hiitRounds,
                videoUrl: (e as BEx).videoUrl,
              })),
            }))
          : emptyProg().schedule;

        const phases: BPhase[] = (program.phases ?? []).map((p) => ({
          id: p.id || Math.random().toString(36).slice(2),
          label: p.label || 'Phase',
          startWeek: p.startWeek || 1,
          endWeek: p.endWeek || program.weeks,
          schedule: hydrateSchedule(p.schedule),
        }));
        const schedule = hydrateSchedule(program.schedule);

        setProg({
          name: program.name,
          description: program.description,
          level: program.level,
          goal: program.goal,
          weeks: program.weeks,
          daysPerWeek: program.daysPerWeek,
          visibility: (program.visibility as 'public' | 'coaching') ?? 'public',
          targetGender: program.targetGender ?? 'anyone',
          imageUrl: program.imageUrl ?? '',
          schedule,
          phases,
        });

        // Auto-attach demo videos from the admin's existing exercise video
        // library wherever a name matches and no video is set yet — built-in
        // seed programs ship with no videos of their own (we can't fabricate
        // real demo footage), but if the admin has already uploaded videos
        // for common exercises (Squat, Push-Up, Pull-Up, etc.) via Admin ->
        // Exercise Library, this wires them up automatically instead of
        // requiring the admin to manually pick one per exercise. Covers
        // every phase's schedule too, not just the top-level one.
        const allSchedules = phases.length > 0 ? phases.map((p) => p.schedule) : [schedule];
        const namesNeedingVideo = allSchedules.flatMap((s) => s.flatMap((d) => d.exercises)).filter((e) => !e.videoUrl).map((e) => e.name);
        if (namesNeedingVideo.length > 0) {
          try {
            const videoMap = await matchExercisesToVideos(namesNeedingVideo);
            if (Object.keys(videoMap).length > 0) {
              const patchDay = (d: BDay) => ({
                ...d,
                exercises: d.exercises.map((e) => e.videoUrl ? e : { ...e, videoUrl: videoMap[e.name] || e.videoUrl }),
              });
              setProg((s) => ({
                ...s,
                schedule: s.schedule.map(patchDay),
                phases: s.phases.map((p) => ({ ...p, schedule: p.schedule.map(patchDay) })),
              }));
            }
          } catch {
            // Non-fatal — admin can still assign videos manually via the picker
          }
        }
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

  async function handleAiDocUpload(file: File) {
    if (!user) return;
    setAiDocExtracting(true);
    try {
      const token = await getIdToken(user);
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/ai/extract-document', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read file');
      setAiDoc({ name: file.name, text: data.text, truncated: data.truncated });
      if (data.truncated) toast(`Only the first part of "${file.name}" was used (it's a long document) — the program will still be based on it.`, { icon: '📄' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setAiDocExtracting(false);
      if (aiDocInputRef.current) aiDocInputRef.current.value = '';
    }
  }

  async function generateWithAI() {
    if (!aiPrompt.trim() || !user) return;
    setAiLoading(true);
    // A multi-phase program can genuinely take a while to generate — but
    // without a cap, a dropped/stalled connection just spins forever with
    // no feedback ("generating... nothing happens"). This needs to be an
    // IDLE timeout (reset every time a chunk actually arrives), not a flat
    // total-duration one — a flat 100s cutoff was exactly why longer
    // prompts kept failing while short ones worked: the stream was still
    // healthy and making progress, just past 100s of *total* elapsed time.
    const controller = new AbortController();
    let idleTimeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);
    const IDLE_TIMEOUT_MS = 45_000;
    const resetIdleTimeout = () => {
      clearTimeout(idleTimeoutId);
      idleTimeoutId = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
    };
    resetIdleTimeout();
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/ai/generate-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: aiPrompt, documentText: aiDoc?.text }),
        signal: controller.signal,
      });
      // The route streams its response — bytes keep flowing to the client
      // the whole time OpenAI is generating, which defeats an idle-timeout
      // proxy/gateway that would otherwise kill a long-held silent request
      // and hand back an HTML error page instead of real JSON. Everything
      // before the __RESULT__ marker is just keep-alive filler; the actual
      // payload is the JSON after it.
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimeout(); // still receiving bytes — not actually stuck
        raw += decoder.decode(value, { stream: true });
      }
      const marker = raw.indexOf('__RESULT__');
      const payload = marker === -1 ? raw : raw.slice(marker + '__RESULT__'.length);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: { program?: any; error?: string };
      try {
        data = JSON.parse(payload);
      } catch {
        throw new Error('Server returned an unexpected response — the connection may have dropped before generation finished. Try a shorter prompt or fewer weeks.');
      }
      if (data.error) throw new Error(data.error);
      if (!data.program) throw new Error('No program returned');

      const p = data.program;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawPhases: any[] = Array.isArray(p.phases) ? p.phases : [];

      // Collect exercise names across every phase's schedule (or the flat
      // schedule if the model didn't return phases) and match them all to
      // library videos in one batch.
      const allSchedulesRaw: BDay[][] = rawPhases.length > 0
        ? rawPhases.map((ph) => ph.schedule ?? [])
        : [p.schedule ?? []];
      const allExNames: string[] = allSchedulesRaw
        .flatMap((s) => s.flatMap((d: BDay) => (d.exercises ?? []).map((e: BEx) => e.name).filter(Boolean)));
      const videoMap = allExNames.length > 0 ? await matchExercisesToVideos(allExNames).catch(() => ({})) : {};

      const normalizeSchedule = (rawSchedule: BDay[]): BDay[] => (rawSchedule || []).map((d: BDay) => ({
        label: d.label || (d.isRest ? 'Rest' : 'Training Day'),
        isRest: !!d.isRest,
        dayNote: d.dayNote || '',
        exercises: (d.exercises || []).map((e: BEx) => ({
          id: Math.random().toString(36).slice(2),
          name: e.name || '',
          muscleGroup: normalizeMuscleGroup(e.muscleGroup),
          sets: Number(e.sets) || 3,
          reps: String(e.reps || '8-12'),
          rpe: Number(e.rpe) || 8,
          restSeconds: Number(e.restSeconds) || 90,
          notes: e.notes || '',
          isCardio: !!e.isCardio,
          cardioDurationSeconds: (e as BEx).cardioDurationSeconds,
          videoUrl: (videoMap as Record<string, string>)[e.name] ?? '',
        })),
      }));

      const phases: BPhase[] = rawPhases.map((ph, i) => ({
        id: Math.random().toString(36).slice(2),
        label: ph.label || `Phase ${i + 1}`,
        startWeek: Number(ph.startWeek) || 1,
        endWeek: Number(ph.endWeek) || p.weeks || 8,
        schedule: normalizeSchedule(ph.schedule),
      }));

      setProg({
        name: p.name || '',
        description: p.description || '',
        level: p.level || 'intermediate',
        goal: p.goal || 'general',
        weeks: p.weeks || 8,
        daysPerWeek: p.daysPerWeek || 4,
        visibility: 'public',
        targetGender: (p.targetGender === 'male' || p.targetGender === 'female') ? p.targetGender : 'anyone',
        imageUrl: '',
        schedule: phases.length > 0 ? phases[0].schedule : normalizeSchedule(p.schedule),
        phases,
      });
      setAiGenerated(true);
      setActiveDay(0);
      setActivePhase(0);
      toast.success('Program generated! Review and edit before saving.');
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      toast.error(isTimeout
        ? 'Generation timed out — try a shorter/simpler prompt, or fewer weeks.'
        : (err instanceof Error ? err.message : 'AI generation failed'));
    } finally {
      clearTimeout(idleTimeoutId);
      setAiLoading(false);
    }
  }

  async function handleSave(publish = false) {
    if (!prog.name.trim()) { toast.error('Program name required'); return; }
    if (!user) return;
    // Phase week-ranges must be coherent before saving — getScheduleForWeek
    // silently picks first-match/last-phase for overlapping or gapped
    // ranges, so bad ranges wouldn't crash anything but WOULD quietly train
    // users on the wrong week's schedule with no warning to anyone.
    if (prog.phases.length > 0) {
      const sorted = [...prog.phases].sort((a, b) => a.startWeek - b.startWeek);
      for (const p of sorted) {
        if (p.startWeek > p.endWeek) {
          toast.error(`"${p.label}": start week ${p.startWeek} is after end week ${p.endWeek}`);
          return;
        }
      }
      if (sorted[0].startWeek !== 1) {
        toast.error(`Phases must start at week 1 — "${sorted[0].label}" starts at week ${sorted[0].startWeek}`);
        return;
      }
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], cur = sorted[i];
        if (cur.startWeek !== prev.endWeek + 1) {
          toast.error(`Gap or overlap between "${prev.label}" (ends wk ${prev.endWeek}) and "${cur.label}" (starts wk ${cur.startWeek})`);
          return;
        }
      }
      const lastEnd = sorted[sorted.length - 1].endWeek;
      if (lastEnd !== prog.weeks) {
        toast.error(`Phases cover weeks 1–${lastEnd} but the program is ${prog.weeks} weeks — adjust the last phase or the program length`);
        return;
      }
    }
    setSaving(true);
    try {
      // A phased program's top-level `schedule`/`exercises` still get kept
      // in sync (mirroring phase 1) purely for older code paths that only
      // ever look at those two fields directly — every phase's exercises
      // are folded into the flat `exercises` list so the muscle-group/video
      // health check and AI-matching cover every phase, not just phase 1.
      const allSchedules = prog.phases.length > 0 ? prog.phases.map((p) => p.schedule) : [prog.schedule];
      const exercises = allSchedules.flatMap((s) => s.flatMap((d) => d.exercises));
      const unique = exercises.filter((e, i, arr) => arr.findIndex(x => x.name === e.name) === i);
      const data = stripUndefinedDeep({
        ...prog,
        schedule: prog.phases.length > 0 ? prog.phases[0].schedule : prog.schedule,
        isPublic: publish || prog.visibility === 'public',
        exercises: unique.map(e => ({ ...e, reps: e.reps })),
        createdBy: user.uid,
        trainerId: user.uid,
        status: publish ? 'published' : 'draft',
      });
      if (savedId && editingBuiltIn) {
        await upsertProgram(savedId, data);
        setEditingBuiltIn(false);
        toast.success(publish ? 'Program published!' : 'Changes saved — now a fully editable program');
      } else if (savedId) {
        await updateProgram(savedId, data);
        toast.success(publish ? 'Program published!' : 'Changes saved');
      } else {
        const ref = await createProgram(data);
        setSavedId(ref.id);
        toast.success(publish ? 'Program published!' : 'Draft saved');
      }
    } catch (err) {
      console.error('[ProgramBuilder] save failed:', err);
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`, { duration: 6000 });
    }
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
    setActiveSchedule((schedule) => schedule.map((d, j) => j === i ? { ...d, ...patch } : d));
  }

  function toggleRest(i: number) {
    const day = activeSchedule[i];
    if (day.isRest) {
      setDay(i, { isRest: false, label: 'Training Day', exercises: [] });
    } else {
      setDay(i, { isRest: true, label: 'Rest', exercises: [] });
    }
  }

  function addExercise(dayIdx: number) {
    const ex = blankEx();
    setDay(dayIdx, { exercises: [...activeSchedule[dayIdx].exercises, ex] });
    setExpandedEx(ex.id);
  }

  function removeExercise(dayIdx: number, exId: string) {
    setDay(dayIdx, { exercises: activeSchedule[dayIdx].exercises.filter(e => e.id !== exId) });
    if (expandedEx === exId) setExpandedEx(null);
  }

  function updateEx(dayIdx: number, exId: string, patch: Partial<BEx>) {
    setDay(dayIdx, { exercises: activeSchedule[dayIdx].exercises.map(e => e.id === exId ? { ...e, ...patch } : e) });
  }

  function moveEx(dayIdx: number, exId: string, dir: -1 | 1) {
    const exs = [...activeSchedule[dayIdx].exercises];
    const i = exs.findIndex(e => e.id === exId);
    const j = i + dir;
    if (j < 0 || j >= exs.length) return;
    [exs[i], exs[j]] = [exs[j], exs[i]];
    setDay(dayIdx, { exercises: exs });
  }

  async function openVideoPicker(exId: string) {
    setVideoPickerFor(exId);
    setVideoSearch('');
    setPreviewingId(null);
    if (videoLibrary.length === 0) {
      setVideoLibraryLoading(true);
      try {
        const lib = await getExerciseVideos();
        setVideoLibrary(lib);
      } catch {
        toast.error('Failed to load video library');
      } finally {
        setVideoLibraryLoading(false);
      }
    }
  }

  function pickVideo(video: ExerciseVideo) {
    if (videoPickerFor) {
      updateEx(activeDay, videoPickerFor, { videoUrl: video.videoUrl });
    }
    setPreviewingId(null);
    setVideoPickerFor(null);
  }

  // Lets the admin upload a video right from the program builder when the
  // library search comes up empty, instead of having to abandon the program
  // they're editing, go add it via Admin → Exercise Library, then come back
  // and search again. Saves to the same exerciseLibrary collection
  // (saveExerciseVideo) so it's immediately available for every other
  // program too, not just this one.
  async function handleUploadNewVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !videoPickerFor) return;
    const ex = activeSchedule[activeDay]?.exercises.find((x) => x.id === videoPickerFor);
    if (!ex?.name.trim()) {
      toast.error('Name the exercise before uploading its video');
      e.target.value = '';
      return;
    }
    setUploadingNewVideo(true);
    setNewVideoUploadProgress(0);
    try {
      const cfg = await getSystemConfig().catch(() => null);
      const provider = ((cfg?.storageProvider as StorageProvider) || 'firebase');
      const videoUrl = await uploadVideo(provider, user, file, 'exerciseLibrary', setNewVideoUploadProgress);
      const thumbBlob = await extractVideoThumbnail(file).catch(() => null);
      let thumbnailUrl: string | undefined;
      if (thumbBlob) {
        const thumbFile = new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' });
        thumbnailUrl = await uploadVideo(provider, user, thumbFile, 'exerciseLibrary').catch(() => undefined);
      }
      const newVideo = {
        name: ex.name.trim(),
        aliases: [],
        muscleGroups: ex.muscleGroup ? [ex.muscleGroup] : [],
        equipment: [],
        videoUrl,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        uploadedBy: user.uid,
      };
      const id = await saveExerciseVideo(newVideo);
      setVideoLibrary((prev) => [{ id, ...newVideo, uploadedAt: new Date() }, ...prev]);
      updateEx(activeDay, videoPickerFor, { videoUrl });
      toast.success('Video uploaded and added to the library');
      setVideoPickerFor(null);
    } catch (err) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`, { duration: 6000 });
    } finally {
      setUploadingNewVideo(false);
      setNewVideoUploadProgress(0);
      e.target.value = '';
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const day = activeSchedule[activeDay];

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
          Describe the program and AI will build a complete weekly schedule with exercises, sets, reps, RPE, and rest times. You can edit everything after. Optionally attach a real program (PDF or .txt) and the AI will base the structure and exercises closely on it instead of inventing generic ones.
        </p>
        <div className="space-y-2">
          <textarea
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            placeholder="e.g. Create a 12-week powerlifting program for an intermediate male, 4 days/week (upper/lower split), focused on squat/bench/deadlift with accessory work. Include deload week every 4th week."
            rows={3}
            className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-none"
          />
          <input
            ref={aiDocInputRef}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAiDocUpload(f); }}
          />
          {aiDoc ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-background border border-white/10 rounded-xl">
              <FileText className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              <span className="text-xs text-white truncate flex-1">{aiDoc.name}</span>
              {aiDoc.truncated && <span className="text-[10px] text-amber-400 flex-shrink-0">truncated</span>}
              <button
                onClick={() => setAiDoc(null)}
                className="text-text-tertiary hover:text-white transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => aiDocInputRef.current?.click()}
              disabled={aiDocExtracting}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-white/15 rounded-xl text-xs text-text-secondary hover:text-white hover:border-white/25 transition-colors disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              {aiDocExtracting ? 'Reading document…' : 'Attach a document (optional)'}
            </button>
          )}
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
          <p className="text-[11px] text-text-tertiary mb-1.5">
            Shown to users on the program detail page and landing page. Length doesn&apos;t matter — line breaks you type here are preserved when it&apos;s shown, so short paragraphs (or a one-line-per-point list) read far easier than one dense block of text.
          </p>
          <textarea
            value={prog.description}
            onChange={e => setProg(s => ({ ...s, description: e.target.value }))}
            placeholder={'What\'s this program about? Who is it for?\n\nBuilt around 4 days/week of heavy compound lifts.\nBest for lifters with at least 6 months of experience.'}
            rows={5}
            className="w-full bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:border-accent/50 resize-y"
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary mb-1 block">Cover Image (shown on landing page & program lists)</label>
          <div className="flex items-center gap-3">
            {prog.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prog.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover border border-white/10 flex-shrink-0" />
            )}
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-white/10 text-xs font-bold text-white cursor-pointer hover:border-accent/40 transition-colors">
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                <Upload className="w-4 h-4" /> {uploadingImage ? 'Uploading…' : prog.imageUrl ? 'Change Image' : 'Upload Image'}
              </label>
              {prog.imageUrl && (
                <button type="button" onClick={() => setProg(s => ({ ...s, imageUrl: '' }))} className="text-[11px] text-danger hover:underline text-left">
                  Remove image
                </button>
              )}
            </div>
          </div>
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
            <label className="text-xs text-text-secondary mb-1 block">Recommended For</label>
            <select
              value={prog.targetGender}
              onChange={e => setProg(s => ({ ...s, targetGender: e.target.value as BProg['targetGender'] }))}
              className="w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50"
            >
              <option value="anyone">Anyone</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
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
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-white">Weekly Schedule</h2>
          {prog.phases.length === 0 && prog.weeks > 4 && (
            <button onClick={addPhase} className="text-xs text-accent hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Split into phases
            </button>
          )}
        </div>
        <p className="text-xs text-text-tertiary mb-4">
          {prog.phases.length === 0
            ? `This one 7-day template repeats for all ${prog.weeks} weeks. Split it into phases if exercises should change partway through (e.g. week 5 onward).`
            : 'Each phase below has its own 7-day template for its week range — exercises can be completely different from one phase to the next.'}
        </p>

        {/* Phase tabs — only shown once a program has been split into phases */}
        {prog.phases.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {prog.phases.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => { setActivePhase(i); setActiveDay(0); }}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    activePhase === i ? 'bg-accent text-black border-accent' : 'bg-surface-elevated text-text-secondary border-white/10 hover:text-white'
                  }`}
                >
                  {p.label} <span className="font-normal opacity-70">(wk {p.startWeek}-{p.endWeek})</span>
                </button>
              ))}
              <button
                onClick={addPhase}
                className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border border-dashed border-white/20 text-text-secondary hover:text-white hover:border-white/40 transition-colors"
              >
                <Plus className="w-3 h-3 inline mr-1" /> Add Phase
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap p-3 bg-surface rounded-xl border border-white/10">
              <input
                value={prog.phases[activePhase]?.label ?? ''}
                onChange={(e) => updatePhase(activePhase, { label: e.target.value })}
                placeholder="Phase label e.g. Base Building"
                className="flex-1 min-w-[140px] bg-surface-elevated border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50"
              />
              <label className="text-[10px] text-text-tertiary flex items-center gap-1.5">
                Weeks
                <input
                  type="number" min={1} value={prog.phases[activePhase]?.startWeek ?? 1}
                  onChange={(e) => updatePhase(activePhase, { startWeek: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-14 bg-surface-elevated border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-accent/50"
                />
                to
                <input
                  type="number" min={1} value={prog.phases[activePhase]?.endWeek ?? 1}
                  onChange={(e) => updatePhase(activePhase, { endWeek: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-14 bg-surface-elevated border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-accent/50"
                />
              </label>
              {prog.phases.length > 1 && (
                <button
                  onClick={() => removePhase(activePhase)}
                  className="p-1.5 text-text-tertiary hover:text-danger transition-colors"
                  title="Remove this phase"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Day tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {DOW.map((d, i) => {
            const isRest = activeSchedule[i]?.isRest;
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
                            <label className="text-[10px] text-text-tertiary mb-1 block">{ex.isCardio && !ex.isHiit ? 'Sets (interval reps)' : 'Sets'}</label>
                            <Input
                              type="number"
                              value={ex.sets}
                              onChange={e => updateEx(activeDay, ex.id, { sets: Math.max(1, Number(e.target.value)) })}
                              min={1} max={20}
                            />
                            {ex.isCardio && !ex.isHiit && ex.sets > 1 && (
                              <p className="text-[10px] text-text-tertiary mt-1">
                                E.g. 8 sets + 400m target + 90s rest = &quot;8x400m&quot; interval repeats, resting between each.
                              </p>
                            )}
                          </div>
                          {ex.isCardio && !ex.isHiit ? (
                            <div className="col-span-2">
                              {/* Time and distance are mutually exclusive — a rep is timed OR
                                  distance-tracked, never both. Showing both inputs at once
                                  (the old version) was genuinely confusing: nothing said which
                                  one actually controlled what happens in the workout. This mode
                                  toggle shows exactly one, and switching modes clears the other
                                  so there's no stale/conflicting value left behind. */}
                              {(() => {
                                // Default the mode from whatever's already saved (a program
                                // loaded from Firestore has real data, no override needed yet);
                                // once the admin explicitly clicks a mode button, that choice
                                // wins regardless of what `reps` currently contains.
                                const distanceMode = cardioModeOverride[ex.id] === 'distance'
                                  || (cardioModeOverride[ex.id] === undefined && !!parseDistance(ex.reps));
                                return (
                                  <>
                                    <div className="flex gap-1.5 mb-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCardioModeOverride(prev => ({ ...prev, [ex.id]: 'timed' }));
                                          if (parseDistance(ex.reps)) updateEx(activeDay, ex.id, { reps: '8' });
                                        }}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${!distanceMode ? 'bg-accent text-white' : 'bg-surface border border-white/10 text-text-secondary'}`}
                                      >
                                        Timed
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCardioModeOverride(prev => ({ ...prev, [ex.id]: 'distance' }));
                                          if (parseDistance(ex.reps)) return;
                                          updateEx(activeDay, ex.id, { reps: '' });
                                        }}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${distanceMode ? 'bg-accent text-white' : 'bg-surface border border-white/10 text-text-secondary'}`}
                                      >
                                        Distance
                                      </button>
                                    </div>
                                    {!distanceMode ? (
                                      <div>
                                        <label className="text-[10px] text-text-tertiary mb-1 block">Duration (per rep)</label>
                                        <CardioDurationInput
                                          valueSeconds={ex.cardioDurationSeconds ?? 60}
                                          onChange={sec => updateEx(activeDay, ex.id, { cardioDurationSeconds: sec })}
                                        />
                                      </div>
                                    ) : (
                                      <div>
                                        <label className="text-[10px] text-text-tertiary mb-1 block">Target Distance (per rep)</label>
                                        <Input
                                          // The session player parses this straight out of the
                                          // `reps` field and, when found, swaps the plain
                                          // countdown timer for a stopwatch + pace tracker.
                                          value={ex.reps}
                                          onChange={e => updateEx(activeDay, ex.id, { reps: e.target.value })}
                                          placeholder="e.g. 500m, 5km, 1 mile"
                                          autoFocus
                                        />
                                        {String(ex.reps).trim() && !parseDistance(ex.reps) && (
                                          <p className="text-[10px] text-amber-400 mt-1">⚠ Not recognized yet — needs a unit, e.g. &quot;500m&quot;, &quot;5km&quot;, &quot;1 mile&quot;.</p>
                                        )}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          ) : !ex.isHiit ? (
                            <div>
                              <label className="text-[10px] text-text-tertiary mb-1 block">Reps / Range</label>
                              <Input
                                value={ex.reps}
                                onChange={e => updateEx(activeDay, ex.id, { reps: e.target.value })}
                                placeholder="e.g. 5 or 8-12"
                              />
                            </div>
                          ) : null}
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
                          <div className="col-span-2 flex items-center justify-between p-2.5 bg-surface rounded-xl border border-white/10">
                            <div>
                              <p className="text-xs font-medium text-white">Cardio Exercise</p>
                              <p className="text-[10px] text-text-tertiary">Shows a timer during the workout instead of sets/reps</p>
                            </div>
                            <button
                              onClick={() => updateEx(activeDay, ex.id, { isCardio: !ex.isCardio, ...(ex.isCardio ? { isHiit: false } : {}) })}
                              className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${ex.isCardio ? 'bg-accent' : 'bg-surface-elevated'}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${ex.isCardio ? 'left-[18px]' : 'left-0.5'}`} />
                            </button>
                          </div>
                          {ex.isCardio && (
                            <div className="col-span-2 flex items-center justify-between p-2.5 bg-surface rounded-xl border border-white/10">
                              <div>
                                <p className="text-xs font-medium text-white">HIIT Intervals</p>
                                <p className="text-[10px] text-text-tertiary">Alternate work/rest rounds instead of one flat timer</p>
                              </div>
                              <button
                                onClick={() => updateEx(activeDay, ex.id, {
                                  isHiit: !ex.isHiit,
                                  hiitWorkSeconds: ex.hiitWorkSeconds || 30,
                                  hiitRestSeconds: ex.hiitRestSeconds || 30,
                                  hiitRounds: ex.hiitRounds || 8,
                                  // A HIIT block is one continuous interval session, not
                                  // several — force sets to 1 so it doesn't render 3 stacked timers.
                                  ...(!ex.isHiit ? { sets: 1 } : {}),
                                })}
                                className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${ex.isHiit ? 'bg-accent' : 'bg-surface-elevated'}`}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${ex.isHiit ? 'left-[18px]' : 'left-0.5'}`} />
                              </button>
                            </div>
                          )}
                          {ex.isCardio && ex.isHiit && (
                            <div className="col-span-2 grid grid-cols-3 gap-2 p-2.5 bg-surface rounded-xl border border-white/10">
                              <div>
                                <label className="text-[10px] text-text-tertiary mb-1 block">Work (sec)</label>
                                <Input
                                  type="number" min={1} max={600} step={1}
                                  value={ex.hiitWorkSeconds ?? 30}
                                  onChange={e => updateEx(activeDay, ex.id, { hiitWorkSeconds: Math.max(1, Number(e.target.value)) })}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-text-tertiary mb-1 block">Rest (sec)</label>
                                <Input
                                  type="number" min={0} max={600} step={5}
                                  value={ex.hiitRestSeconds ?? 30}
                                  onChange={e => updateEx(activeDay, ex.id, { hiitRestSeconds: Math.max(0, Number(e.target.value)) })}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-text-tertiary mb-1 block">Rounds</label>
                                <Input
                                  type="number" min={1} max={50} step={1}
                                  value={ex.hiitRounds ?? 8}
                                  onChange={e => updateEx(activeDay, ex.id, { hiitRounds: Math.max(1, Number(e.target.value)) })}
                                />
                              </div>
                              <p className="col-span-3 text-[10px] text-text-tertiary">
                                e.g. 30 sec on / 30 sec off × 8 rounds = 8 min total
                              </p>
                            </div>
                          )}
                          <div className="col-span-2">
                            <label className="text-[10px] text-text-tertiary mb-1 block">Exercise Tip (shown to user during workout)</label>
                            <Input
                              value={ex.notes}
                              onChange={e => updateEx(activeDay, ex.id, { notes: e.target.value })}
                              placeholder="e.g. Keep chest up, drive through heels"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-text-tertiary mb-1 block">Demo Video</label>
                            {ex.videoUrl ? (
                              <div className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-white/10">
                                {(() => {
                                  const libEntry = videoLibrary.find(v => v.videoUrl === ex.videoUrl);
                                  const isPreviewing = previewingId === ex.id;
                                  return (
                                    <button
                                      onClick={() => setPreviewingId(isPreviewing ? null : ex.id)}
                                      className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative flex items-center justify-center ${libEntry?.thumbnailUrl || isPreviewing ? 'bg-black' : 'bg-surface-elevated border border-white/10'}`}
                                      title="Preview"
                                    >
                                      {isPreviewing ? (
                                        <video
                                          key={ex.videoUrl}
                                          src={ex.videoUrl}
                                          muted
                                          loop
                                          autoPlay
                                          playsInline
                                          crossOrigin="anonymous"
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <>
                                          {libEntry?.thumbnailUrl && (
                                            <img src={libEntry.thumbnailUrl} alt={ex.name} className="absolute inset-0 w-full h-full object-cover" />
                                          )}
                                          <Play className={`w-4 h-4 relative z-10 ${libEntry?.thumbnailUrl ? 'text-white' : 'text-text-tertiary'}`} />
                                        </>
                                      )}
                                    </button>
                                  );
                                })()}
                                <span className="text-xs text-text-secondary truncate flex-1">Video attached</span>
                                <button
                                  onClick={() => openVideoPicker(ex.id)}
                                  className="text-xs text-accent hover:underline flex-shrink-0"
                                >
                                  Change
                                </button>
                                <button
                                  onClick={() => updateEx(activeDay, ex.id, { videoUrl: '' })}
                                  className="p-1 text-text-tertiary hover:text-danger flex-shrink-0"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => openVideoPicker(ex.id)}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/20 text-text-secondary hover:text-white hover:border-white/40 text-xs transition-colors"
                              >
                                <Search className="w-3.5 h-3.5" /> Search Video Library
                              </button>
                            )}
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
        <h2 className="text-sm font-bold text-white mb-3">
          Week Overview{prog.phases.length > 0 ? ` — ${prog.phases[activePhase]?.label}` : ''}
        </h2>
        <div className="grid grid-cols-7 gap-1">
          {DOW.map((d, i) => {
            const s = activeSchedule[i];
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

      {/* Video picker modal */}
      <Modal open={!!videoPickerFor} onClose={() => setVideoPickerFor(null)} title="Select Demo Video">
        <div className="space-y-3">
          {/* Upload directly, right here, when the library search below comes
              up empty — no need to leave the builder to add it via the
              separate Exercise Library page first. */}
          <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-dashed transition-colors cursor-pointer text-xs font-medium ${uploadingNewVideo ? 'border-white/10 text-text-tertiary' : 'border-accent/40 text-accent hover:border-accent hover:bg-accent-muted'}`}>
            {uploadingNewVideo ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Uploading... {newVideoUploadProgress > 0 ? `${Math.round(newVideoUploadProgress)}%` : ''}
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" /> No video for this exercise? Upload one now
              </>
            )}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={uploadingNewVideo}
              onChange={handleUploadNewVideo}
            />
          </label>

          <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
            <div className="flex-1 h-px bg-white/10" />
            OR PICK FROM LIBRARY
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <Input
            value={videoSearch}
            onChange={e => setVideoSearch(e.target.value)}
            placeholder="Search by exercise name..."
            autoFocus
          />
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {videoLibraryLoading && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
              </div>
            )}
            {!videoLibraryLoading && videoLibrary
              .filter((v) => {
                const q = videoSearch.trim().toLowerCase();
                if (!q) return true;
                return v.name.toLowerCase().includes(q) || (v.aliases ?? []).some((a) => a.toLowerCase().includes(q));
              })
              .map((v) => (
                <div
                  key={v.id}
                  className="w-full p-3 bg-surface-elevated rounded-xl flex items-center gap-3"
                >
                  <button
                    onClick={() => setPreviewingId(previewingId === v.id ? null : v.id)}
                    className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 relative flex items-center justify-center ${v.thumbnailUrl || previewingId === v.id ? 'bg-black' : 'bg-surface-elevated border border-white/10'}`}
                    title="Preview"
                  >
                    {previewingId === v.id ? (
                      <video
                        key={v.videoUrl}
                        src={v.videoUrl}
                        muted
                        loop
                        autoPlay
                        playsInline
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <>
                        {v.thumbnailUrl && (
                          <img src={v.thumbnailUrl} alt={v.name} className="absolute inset-0 w-full h-full object-cover" />
                        )}
                        <Play className={`w-5 h-5 relative z-10 ${v.thumbnailUrl ? 'text-white' : 'text-text-tertiary'}`} />
                      </>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{v.name}</p>
                    {v.muscleGroups?.length > 0 && (
                      <p className="text-xs text-text-secondary truncate">{v.muscleGroups.join(', ')}</p>
                    )}
                  </div>
                  <Button size="sm" onClick={() => pickVideo(v)} className="flex-shrink-0">
                    Select
                  </Button>
                </div>
              ))}
            {!videoLibraryLoading && videoLibrary.length === 0 && (
              <p className="text-text-secondary text-sm text-center py-4">No videos in the library yet.</p>
            )}
            {!videoLibraryLoading && videoLibrary.length > 0 && videoLibrary.filter((v) => {
              const q = videoSearch.trim().toLowerCase();
              if (!q) return true;
              return v.name.toLowerCase().includes(q) || (v.aliases ?? []).some((a) => a.toLowerCase().includes(q));
            }).length === 0 && (
              <p className="text-text-secondary text-sm text-center py-4">No matches for &ldquo;{videoSearch}&rdquo;.</p>
            )}
          </div>
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
