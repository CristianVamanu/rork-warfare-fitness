'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Camera, Upload, Flame, Beef, Wheat, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { logMeal } from '@/lib/firestore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { NutritionAnalysis } from '@/types';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export default function AnalyzeFoodPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<NutritionAnalysis | null>(null);
  const [saving, setSaving] = useState(false);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [showAddModal, setShowAddModal] = useState(false);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = (e.target?.result as string).split(',')[1];
      setPreview(e.target?.result as string);
      analyzeImage(b64);
    };
    reader.readAsDataURL(file);
  }, []);

  const analyzeImage = async (base64Image: string) => {
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch('/api/ai/analyze-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      const data = await res.json();
      setResult(data);
    } catch {
      toast.error('Failed to analyze food. Check your OpenAI configuration.');
    } finally {
      setAnalyzing(false);
    }
  };

  const addToLog = async () => {
    if (!result || !user) return;
    setSaving(true);
    try {
      await logMeal({ userId: user.uid, ...result, mealType });
      toast.success(`${result.name} added to ${mealType}`);
      router.replace('/nutrition');
    } catch {
      toast.error('Failed to save meal');
      setSaving(false);
    }
  };

  return (
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
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
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
          <Button variant="secondary" onClick={() => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFile(file);
            };
            input.click();
          }}>
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
                  </div>
                  <div className="p-2 bg-green-400/10 rounded-xl">
                    <span className="text-xl">✅</span>
                  </div>
                </div>

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
                  Add to Log
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
  );
}
