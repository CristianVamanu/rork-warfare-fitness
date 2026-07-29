'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Camera, Upload, X as XIcon, Sparkles, Dumbbell, ArrowRight, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { getIdToken } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Exercise } from '@/types';

const MAX_PHOTOS = 6;

// Same resize approach as the food-photo analyzer — camera photos can be
// several MB each; sending up to 6 of them raw would blow past Vercel's
// serverless request body limit. OpenAI's vision "low detail" mode only
// uses ~512px anyway, so nothing is lost.
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
}

export default function ScanAndGoPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          base64Images: photos.map((p) => p.split(',')[1]),
          experience: profile?.experience,
          fitnessGoal: profile?.fitnessGoal,
          limitations: profile?.limitations,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text ? (JSON.parse(text).error ?? text) : `HTTP ${res.status}`);
      const data = JSON.parse(text) as { equipmentDetected: string[]; ignoredNote: string; exercises: { name: string; sets: number; reps: string | number; restSeconds: number; notes?: string }[] };
      const exercises: Exercise[] = data.exercises.map((ex, i) => ({
        id: `scan-go-${i}`,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restSeconds: ex.restSeconds,
        notes: ex.notes,
      }));
      setResult({ equipmentDetected: data.equipmentDetected, ignoredNote: data.ignoredNote, exercises });
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
      <div className="px-4 py-4 space-y-5 max-w-lg mx-auto">
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

            <Button fullWidth size="lg" disabled={photos.length === 0} loading={scanning} onClick={handleScan}>
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
                      <p className="text-sm font-semibold text-white">{ex.name}</p>
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
