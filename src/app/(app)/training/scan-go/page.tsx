'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Camera, Upload, X as XIcon, Sparkles, Dumbbell, ArrowRight, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { getIdToken } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { localDateHeader } from '@/lib/utils';
import type { Exercise } from '@/types';

const MAX_PHOTOS = 6;

// Same resize approach as the food-photo analyzer — camera photos can be
// several MB each; sending up to 6 of them raw would blow past Vercel's
// serverless request body limit. The API route requests OpenAI's "high"
// detail mode (needed to reliably tell visually-similar machines apart —
// e.g. a leg press vs. a leg extension machine, previously getting blurred
// together at low detail and producing generic/wrong exercise picks), so
// this resize target is set high enough to still give it real detail to
// work with while staying well under any request-size limits.
function resizeImage(dataUrl: string, maxDimension: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) { height = Math.round((height * maxDimension) / width); width = maxDimension; }
        else { width = Math.round((width * maxDimension) / height); height = maxDimension; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface ScanResult {
  equipmentDetected: string[];
  ignoredNote: string;
  exercises: Exercise[];
  // Display-only, keyed by index alongside `exercises` — not persisted
  // into the workout session itself, just shown here so it's obvious
  // which detected equipment each pick actually uses (and easy to spot if
  // something looks off before starting).
  equipmentPerExercise: string[];
}

export default function ScanAndGoPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    getIdToken(user)
      .then((token) => fetch('/api/ai/scan-and-go', { headers: { Authorization: `Bearer ${token}`, ...localDateHeader() } }))
      .then((res) => res.json())
      .then((data: { remaining?: number }) => { if (typeof data.remaining === 'number') setRemaining(data.remaining); })
      .catch(() => {});
  }, [user]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList).slice(0, MAX_PHOTOS - photos.length);
    if (files.length === 0) return;
    try {
      const resized = await Promise.all(files.map(async (f) => {
        const raw = await fileToDataUrl(f);
        return resizeImage(raw, 900, 0.75).catch(() => raw);
      }));
      setPhotos((prev) => [...prev, ...resized].slice(0, MAX_PHOTOS));
    } catch {
      toast.error('Failed to load one of those photos — try again');
    }
  }

  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleScan() {
    if (!user || photos.length === 0) return;
    setScanning(true);
    setResult(null);
    try {
      const token = await getIdToken(user);
      const res = await fetch('/api/ai/scan-and-go', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...localDateHeader() },
        body: JSON.stringify({
          // Full data URLs (not just the base64 payload) — resizeImage
          // always re-encodes as JPEG via canvas, but its catch fallback
          // keeps the ORIGINAL file's data URL if canvas resizing throws
          // (e.g. a tainted canvas or decode failure), which isn't
          // necessarily JPEG (PNG screenshots, HEIC-derived uploads).
          // Sending the real data URL through means the API route never
          // has to guess/hardcode a MIME type that might not match the
          // actual bytes.
          dataUrls: photos,
          experience: profile?.experience,
          fitnessGoal: profile?.fitnessGoal,
          limitations: profile?.limitations,
        }),
      });
      const text = await res.text();
      const body = text ? JSON.parse(text) : {};
      // Both success and refunded-failure responses carry the up-to-date
      // count, so the display never drifts from what the server actually
      // charged — updating it here regardless of res.ok.
      if (typeof body.remaining === 'number') setRemaining(body.remaining);
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const data = body as { equipmentDetected: string[]; ignoredNote: string; exercises: { name: string; equipmentUsed?: string; sets: number; reps: string | number; restSeconds: number; notes?: string }[] };
      const exercises: Exercise[] = data.exercises.map((ex, i) => ({
        id: `scan-go-${i}`,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restSeconds: ex.restSeconds,
        notes: ex.notes,
      }));
      setResult({
        equipmentDetected: data.equipmentDetected,
        ignoredNote: data.ignoredNote,
        exercises,
        equipmentPerExercise: data.exercises.map((ex) => ex.equipmentUsed || 'bodyweight'),
      });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      toast.error(`Scan failed: ${msg}`, { duration: 8000 });
    } finally {
      setScanning(false);
    }
  }

  function startWorkout() {
    if (!result) return;
    sessionStorage.setItem('scan_go_exercises', JSON.stringify(result.exercises));
    router.push('/training/session?source=scan-go');
  }

  return (
    <div>
      <Header title="Scan & Go" showBack />
      <div className="px-4 py-4 space-y-5 max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
        {!result && (
          <>
            <Card className="p-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-3">
                <Camera className="w-7 h-7 text-accent" />
              </div>
              <h1 className="text-lg font-black text-white mb-1.5">Scan what you've got</h1>
              <p className="text-sm text-text-secondary leading-relaxed">
                Take up to {MAX_PHOTOS} photos of the equipment around you — a hotel gym, a friend's setup, whatever's in front of you — and get a single workout built around exactly what's there. No commitment beyond today.
              </p>
              {remaining !== null && (
                <p className={`text-xs font-semibold mt-3 ${remaining === 0 ? 'text-red-400' : 'text-text-tertiary'}`}>
                  {remaining === 0 ? 'No scans left today — try again tomorrow' : `${remaining} scan${remaining === 1 ? '' : 's'} left today`}
                </p>
              )}
            </Card>

            <div className="grid grid-cols-3 gap-2">
              {photos.map((src, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Equipment ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center"
                  >
                    <XIcon className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-1 text-text-tertiary hover:border-accent/40 hover:text-accent transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Add photo</span>
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            <Button fullWidth size="lg" disabled={photos.length === 0 || remaining === 0} loading={scanning} onClick={handleScan}>
              <Sparkles className="w-4 h-4" /> {scanning ? 'Scanning…' : 'Generate My Workout'}
            </Button>
          </>
        )}

        {result && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Dumbbell className="w-4 h-4 text-accent" />
                <p className="text-sm font-bold text-white">Equipment detected</p>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {result.equipmentDetected.length > 0 ? result.equipmentDetected.map((eq) => (
                  <span key={eq} className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent-muted text-accent">{eq}</span>
                )) : (
                  <span className="text-xs text-text-tertiary">Bodyweight only</span>
                )}
              </div>
              {result.ignoredNote && (
                <p className="text-xs text-text-tertiary flex items-start gap-1.5 mt-3">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {result.ignoredNote}
                </p>
              )}
            </Card>

            <Card className="p-5">
              <p className="text-sm font-bold text-white mb-3">Today's Workout</p>
              <div className="space-y-3">
                {result.exercises.map((ex, i) => (
                  <div key={ex.id} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-surface-elevated border border-white/10 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-white">{ex.name}</p>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/5 text-text-tertiary">{result.equipmentPerExercise[i]}</span>
                      </div>
                      <p className="text-xs text-text-secondary">{ex.sets} sets × {ex.reps} · {ex.restSeconds}s rest</p>
                      {ex.notes && <p className="text-xs text-text-tertiary mt-0.5">{ex.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setResult(null)}>Rescan</Button>
              <Button fullWidth size="lg" onClick={startWorkout}>
                Start Workout <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
