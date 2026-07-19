'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Camera, Upload, Flame, Beef, Wheat, AlertCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayMeals, getUserGoals } from '@/lib/firestore';
import { logMealAction } from '@/lib/actions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PaywallGate } from '@/components/ui/PaywallGate';
import type { NutritionAnalysis, UserGoals, Meal } from '@/types';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const DEFAULT_GOALS: UserGoals = { calories: 2200, protein: 160, carbs: 250, fat: 70, water: 3000 };

/**
 * Downscales a data-URL image to at most maxDimension on its longest side and
 * re-encodes as JPEG. Camera photos can be 3-10MB — base64-encoded, that
 * comfortably exceeds Vercel's ~4.5MB serverless request body limit and gets
 * rejected as "entity too large" before it ever reaches our API route.
 * OpenAI's vision "low detail" mode only uses ~512px of the image anyway, so
 * this loses no real analysis quality.
 */
function resizeImage(dataUrl: string, maxDimension: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
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

export default function AnalyzeFoodPage() {
  return (
    <Suspense fallback={null}>
      <AnalyzeFoodPageInner />
    </Suspense>
  );
}

function AnalyzeFoodPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<NutritionAnalysis | null>(null);
  const [saving, setSaving] = useState(false);
  const initialMealType = (searchParams.get('mealType') as MealType | null) ?? 'lunch';
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [todayCalories, setTodayCalories] = useState(0);
  const [goals, setGoals] = useState<UserGoals>(DEFAULT_GOALS);

  useEffect(() => {
    if (!user) return;
    Promise.all([getTodayMeals(user.uid), getUserGoals(user.uid)]).then(([meals, g]) => {
      const total = (meals as Meal[]).reduce((s, m) => s + m.calories, 0);
      setTodayCalories(total);
      setGoals(g);
    });
  }, [user]);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const original = e.target?.result as string;
      try {
        const resized = await resizeImage(original, 1024, 0.75);
        setPreview(resized);
        analyzeImage(resized.split(',')[1]);
      } catch {
        // Fallback to the original if resizing fails for any reason
        setPreview(original);
        analyzeImage(original.split(',')[1]);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const analyzeImage = async (base64Image: string) => {
    if (!user) { toast.error('Not signed in'); return; }
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/analyze-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image, uid: user.uid }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      const data = JSON.parse(text);
      setResult(data);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || String(err);
      toast.error(`Analysis failed: ${msg}`, { duration: 8000 });
    } finally {
      setAnalyzing(false);
    }
  };

  const addToLog = async () => {
    if (!result || !user) return;
    const projectedCalories = todayCalories + result.calories;
    if (projectedCalories > goals.calories) {
      const over = projectedCalories - goals.calories;
      const ok = window.confirm(
        `This meal will put you ${over} kcal over your daily goal of ${goals.calories} kcal.\n\nTotal would be ${projectedCalories} kcal. Add anyway?`
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      await logMealAction(user.uid, { ...result, mealType });
      toast.success(`${result.name} added to ${mealType}`);
      router.back();
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      const display = e?.code ? `${e.code}: ${e.message}` : (e?.message || String(err));
      toast.error(`Failed to save meal: ${display}`, { duration: 8000 });
      setSaving(false);
    }
  };

  const caloriesAfter = result ? todayCalories + result.calories : todayCalories;
  const willExceed = result && caloriesAfter > goals.calories;

  return (
    <PaywallGate feature="nutrition-ai">
    <div>
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/8">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.back()} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-white">AI Food Analyzer</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
        {/* Upload Area */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = ''; // allow re-selecting the same file/retaking the same shot
            }}
          />
          <input
            ref={galleryFileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />

          {preview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Food" className="w-full aspect-square object-cover rounded-2xl" />
              {analyzing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
                  <div className="text-center">
                    <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm text-white font-medium">Analyzing...</p>
                    <p className="text-xs text-text-secondary mt-1">AI is reading your food</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-square border-2 border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center gap-4 hover:border-accent/50 transition-colors group"
            >
              <div className="p-5 rounded-full bg-accent-muted group-hover:bg-accent/20 transition-colors">
                <Camera className="w-10 h-10 text-accent" />
              </div>
              <div className="text-center">
                <p className="text-white font-medium">Take a photo or upload</p>
                <p className="text-text-secondary text-sm mt-1">AI will identify the food and macros</p>
              </div>
            </button>
          )}
        </motion.div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Camera className="w-4 h-4" /> Camera
          </Button>
          <Button variant="secondary" onClick={() => galleryFileRef.current?.click()}>
            <Upload className="w-4 h-4" /> Upload
          </Button>
        </div>

        {/* Result Card */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Card className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white">{result.name}</h3>
                    <p className="text-2xl font-black text-accent mt-1">{result.calories} kcal</p>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Today: {todayCalories} → {caloriesAfter} / {goals.calories} kcal
                    </p>
                  </div>
                  <div className={`p-2 rounded-xl ${willExceed ? 'bg-red-400/10' : 'bg-green-400/10'}`}>
                    <span className="text-xl">{willExceed ? '⚠️' : '✅'}</span>
                  </div>
                </div>

                {willExceed && (
                  <div className="flex items-center gap-2 bg-red-400/10 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-400">
                      Adding this meal will exceed your daily calorie goal by {caloriesAfter - goals.calories} kcal.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Beef, label: 'Protein', value: result.protein, unit: 'g', color: 'text-red-400', bg: 'bg-red-400/10' },
                    { icon: Wheat, label: 'Carbs', value: result.carbs, unit: 'g', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
                    { icon: Flame, label: 'Fat', value: result.fat, unit: 'g', color: 'text-orange-400', bg: 'bg-orange-400/10' },
                  ].map(({ icon: Icon, label, value, unit, color, bg }) => (
                    <div key={label} className={`p-3 ${bg} rounded-xl text-center`}>
                      <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                      <p className="text-sm font-bold text-white">{value}{unit}</p>
                      <p className="text-[10px] text-text-secondary">{label}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-xs text-text-secondary mb-2">Add to meal:</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setMealType(t)}
                        className={`py-1.5 text-xs rounded-lg font-medium transition-all ${
                          mealType === t ? 'bg-accent text-black' : 'bg-surface-elevated text-text-secondary'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <Button fullWidth size="lg" loading={saving} onClick={addToLog}>
                  Add to {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info */}
        {!preview && (
          <Card glass className="p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">Powered by GPT-4o Vision</p>
              <p className="text-xs text-text-secondary mt-1">
                Take a clear photo of your meal for the most accurate nutritional analysis.
                Works best with whole plates and distinct food items.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
    </PaywallGate>
  );
}
