'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Upload, X, Video, Image as ImageIcon, Dumbbell, Zap, ShieldCheck } from 'lucide-react';
import type { User } from 'firebase/auth';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { createPRPost, getSystemConfig } from '@/lib/firestore';
import { uploadUserContent, resolveStorageProvider } from '@/lib/uploadVideo';

type Unit = 'kg' | 'lb';
const LB_PER_KG = 2.2046226218;

/** Epley estimate, the one every strength app quotes. Reps of 1 return the load itself. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

const MAX_MEDIA_MB = 200;

export function PRComposer({ open, user, displayName, photoURL, reviewRequired, onClose, onPosted }: {
  open: boolean;
  user: User;
  displayName: string;
  photoURL: string | null;
  /** Whether the admin holds new posts for review; only changes the copy. */
  reviewRequired: boolean;
  onClose: () => void;
  onPosted?: () => void;
}) {
  const [exerciseName, setExerciseName] = useState('');
  const [unit, setUnit] = useState<Unit>('kg');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const weightKg = useMemo(() => {
    const n = Number(weight);
    if (!(n > 0)) return 0;
    return unit === 'kg' ? n : n / LB_PER_KG;
  }, [weight, unit]);
  const repsN = Math.max(0, Math.floor(Number(reps) || 0));
  const e1rm = estimateOneRepMax(weightKg, repsN);
  const e1rmShown = unit === 'kg' ? e1rm : e1rm * LB_PER_KG;
  const valid = exerciseName.trim().length > 0 && weightKg > 0 && repsN > 0;

  const pickFile = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    if (!f) { setFile(null); setPreview(null); return; }
    if (!f.type.startsWith('video') && !f.type.startsWith('image')) { toast.error('Add a photo or a video'); return; }
    if (f.size > MAX_MEDIA_MB * 1024 * 1024) { toast.error(`Keep it under ${MAX_MEDIA_MB}MB`); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  };

  const reset = () => {
    setExerciseName(''); setWeight(''); setReps(''); setNote(''); pickFile(null); setProgress(0);
  };

  const submit = async () => {
    if (!valid || uploading) return;
    setUploading(true);
    try {
      let mediaUrl: string | undefined;
      let mediaType: 'image' | 'video' | undefined;
      if (file) {
        mediaType = file.type.startsWith('video') ? 'video' : 'image';
        const cfg = await getSystemConfig().catch(() => null);
        mediaUrl = await uploadUserContent(resolveStorageProvider(cfg?.storageProvider), user, file, 'prPosts', setProgress);
      }
      await createPRPost({
        userId: user.uid,
        displayName,
        photoURL,
        exerciseName: exerciseName.trim(),
        weightKg: Math.round(weightKg * 10) / 10,
        reps: repsN,
        note: note.trim() || undefined,
        mediaUrl,
        mediaType,
        verificationLevel: 'unverified',
      });
      toast.success(reviewRequired ? 'Sent. It shows once an admin has looked at it.' : 'On the wall.');
      reset();
      onPosted?.();
      onClose();
    } catch (err) {
      console.error('[PRComposer] submit failed:', err);
      toast.error('Failed to post. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const ringR = 26, ringC = 2 * Math.PI * ringR;

  return (
    <Modal
      open={open}
      onClose={() => { if (!uploading) onClose(); }}
      className="max-w-md"
      footer={
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[11px] text-text-tertiary leading-snug">
            {reviewRequired
              ? 'Held for an admin before it shows. Proof gets it a Verified badge.'
              : 'Goes live at once. Add proof and an admin can mark it Verified.'}
          </p>
          <Button onClick={submit} loading={uploading} disabled={!valid} className="px-6">
            <Zap className="w-4 h-4" /> Post PR
          </Button>
        </div>
      }
    >
      <div className="-m-5 p-5 relative overflow-hidden rounded-2xl">
        {/* backdrop: faint grid + accent bloom, the app's "tech" surface */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(90% 50% at 100% 0%, rgb(var(--accent-rgb) / 0.14), transparent 60%),' +
              'linear-gradient(rgb(var(--accent-rgb) / 0.06) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgb(var(--accent-rgb) / 0.06) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 28px 28px, 28px 28px',
          }}
        />

        <div className="relative space-y-4">
          {/* header row */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-accent/30 bg-accent/10 flex items-center justify-center shadow-[0_0_24px_rgb(var(--accent-rgb)/0.25)]">
              <Dumbbell className="w-5 h-5 text-accent" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.28em] text-accent/90 uppercase">New record</p>
              <p className="text-base font-black text-white leading-tight">Log the lift</p>
            </div>
            <div className="flex rounded-lg border border-white/10 overflow-hidden text-[11px] font-bold">
              {(['kg', 'lb'] as Unit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`px-2.5 py-1 transition-colors ${unit === u ? 'bg-accent text-black' : 'text-text-secondary hover:text-white'}`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* exercise */}
          <Field label="Exercise">
            <input
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              placeholder="Deadlift, Bench, Back squat…"
              maxLength={60}
              autoFocus
              className="w-full bg-transparent text-[15px] font-semibold text-white placeholder:text-text-tertiary outline-none"
            />
          </Field>

          {/* load + reps */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Load · ${unit}`}>
              <input
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0"
                className="w-full bg-transparent text-3xl font-black text-white tabular-nums placeholder:text-text-tertiary/60 outline-none"
              />
            </Field>
            <Field label="Reps">
              <input
                value={reps}
                onChange={(e) => setReps(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="0"
                className="w-full bg-transparent text-3xl font-black text-white tabular-nums placeholder:text-text-tertiary/60 outline-none"
              />
            </Field>
          </div>

          {/* live readout */}
          <div className="flex items-center justify-between rounded-xl border border-accent/20 bg-black/30 px-3.5 py-2.5">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.24em] text-text-tertiary uppercase">Est. 1RM</p>
              <p className="text-[10px] text-text-tertiary">Epley · {repsN > 1 ? `${repsN} reps` : 'single'}</p>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={Math.round(e1rmShown)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="text-2xl font-black tabular-nums text-accent"
              >
                {e1rmShown > 0 ? Math.round(e1rmShown) : '—'}
                <span className="text-xs font-bold text-text-secondary ml-1">{unit}</span>
              </motion.p>
            </AnimatePresence>
          </div>

          {/* proof */}
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`relative rounded-xl border overflow-hidden transition-colors ${dragOver ? 'border-accent bg-accent/10' : 'border-dashed border-white/15 bg-black/20'}`}
          >
            {file && preview ? (
              <div className="relative">
                {file.type.startsWith('video') ? (
                  <video src={preview} muted playsInline autoPlay loop className="w-full max-h-56 object-cover bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="w-full max-h-56 object-cover bg-black" />
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 py-2 bg-gradient-to-t from-black/85 to-transparent">
                  {file.type.startsWith('video') ? <Video className="w-3.5 h-3.5 text-accent" /> : <ImageIcon className="w-3.5 h-3.5 text-accent" />}
                  <p className="flex-1 text-[11px] text-white/90 truncate">{file.name} · {(file.size / 1e6).toFixed(1)}MB</p>
                  {!uploading && (
                    <button type="button" onClick={() => pickFile(null)} className="p-1 rounded-md bg-black/50 text-white/80 hover:text-white" aria-label="Remove file">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                    <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                      <circle cx="32" cy="32" r={ringR} stroke="rgb(255 255 255 / 0.12)" strokeWidth="4" fill="none" />
                      <circle
                        cx="32" cy="32" r={ringR} stroke="rgb(var(--accent-rgb))" strokeWidth="4" fill="none" strokeLinecap="round"
                        strokeDasharray={ringC} strokeDashoffset={ringC * (1 - progress / 100)}
                        style={{ transition: 'stroke-dashoffset .25s ease', filter: 'drop-shadow(0 0 6px rgb(var(--accent-rgb) / 0.8))' }}
                      />
                    </svg>
                    <p className="text-[11px] font-semibold tracking-[0.2em] text-white uppercase">Uploading {Math.round(progress)}%</p>
                    <motion.div
                      aria-hidden
                      className="absolute inset-x-0 h-px bg-accent/70"
                      initial={{ top: '0%' }}
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                      style={{ boxShadow: '0 0 12px rgb(var(--accent-rgb) / 0.9)' }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-1.5 py-6 text-center"
              >
                <span className="w-9 h-9 rounded-full border border-accent/30 bg-accent/10 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-accent" />
                </span>
                <span className="text-sm font-semibold text-white">Add proof</span>
                <span className="text-[11px] text-text-tertiary">Photo or video. Drop it here or tap.</span>
              </button>
            )}
          </div>

          {/* note */}
          <Field label="Note · optional">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Belt, no straps, paused…"
              rows={2}
              maxLength={280}
              className="w-full bg-transparent text-sm text-white placeholder:text-text-tertiary outline-none resize-none"
            />
          </Field>

          {!reviewRequired && (
            <p className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
              <ShieldCheck className="w-3.5 h-3.5 text-accent/80" />
              Fake numbers get the post pulled and posting locked.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5 focus-within:border-accent/50 focus-within:shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35),0_0_24px_rgb(var(--accent-rgb)/0.12)] transition-all">
      <span className="block text-[10px] font-semibold tracking-[0.24em] text-text-tertiary uppercase mb-1">{label}</span>
      {children}
    </label>
  );
}
