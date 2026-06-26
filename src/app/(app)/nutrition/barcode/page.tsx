'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Scan, Flame, Beef, Wheat, AlertCircle, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { logMeal } from '@/lib/firestore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { NutritionAnalysis } from '@/types';

interface OpenFoodFactsProduct {
  product_name?: string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    'proteins_100g'?: number;
    'carbohydrates_100g'?: number;
    'fat_100g'?: number;
  };
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export default function BarcodePage() {
  const router = useRouter();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<NutritionAnalysis | null>(null);
  const [productName, setProductName] = useState('');
  const [mealType, setMealType] = useState<MealType>('snack');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      // Note: BarcodeDetector API would go here
      // For fallback, user can type barcode manually
    } catch {
      setHasCamera(false);
      toast.error('Camera not available');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  useEffect(() => () => stopCamera(), []);

  const lookupBarcode = async (code: string) => {
    if (!code.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/nutrition/barcode?code=${code.trim()}`);
      if (!res.ok) throw new Error('Product not found');
      const data = await res.json();
      setResult(data.nutrition);
      setProductName(data.name);
    } catch {
      toast.error('Product not found. Try another barcode.');
    } finally {
      setSearching(false);
    }
  };

  const addToLog = async () => {
    if (!result || !user) return;
    setSaving(true);
    try {
      const { name: _n, ...rest } = result;
      await logMeal({ userId: user.uid, name: productName || result.name, ...rest, mealType });
      toast.success('Added to log!');
      router.replace('/nutrition');
    } catch {
      toast.error('Failed to save');
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/8">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => { stopCamera(); router.back(); }} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-white">Barcode Scanner</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
        {/* Camera Viewfinder */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="relative aspect-square bg-black rounded-2xl overflow-hidden">
            {scanning ? (
              <>
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                {/* Scanning overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-2/3 h-1/3">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-accent rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-accent rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-accent rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-accent rounded-br-lg" />
                    <motion.div
                      animate={{ top: ['15%', '75%', '15%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-x-0 h-0.5 bg-accent opacity-70"
                    />
                  </div>
                </div>
                <button
                  onClick={stopCamera}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-black/50 rounded-lg text-xs text-white"
                >
                  Stop
                </button>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <div className="p-5 bg-accent-muted rounded-full">
                  <Scan className="w-10 h-10 text-accent" />
                </div>
                {!hasCamera ? (
                  <div className="text-center px-4">
                    <Smartphone className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                    <p className="text-white text-sm font-medium">Camera not available</p>
                    <p className="text-text-secondary text-xs mt-1">Use manual entry below</p>
                  </div>
                ) : (
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-accent text-black rounded-xl text-sm font-bold"
                  >
                    Start Camera
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Manual Entry */}
        <Card className="p-4">
          <p className="text-xs text-text-secondary mb-2">Or enter barcode manually:</p>
          <div className="flex gap-2">
            <input
              type="number"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="e.g. 5000112546415"
              className="flex-1 bg-surface-elevated border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
              onKeyDown={(e) => e.key === 'Enter' && lookupBarcode(manualCode)}
            />
            <Button loading={searching} onClick={() => lookupBarcode(manualCode)} size="sm">
              Search
            </Button>
          </div>
        </Card>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-black text-white">{productName || result.name}</h3>
                  <p className="text-2xl font-black text-accent mt-1">{result.calories} kcal</p>
                  <p className="text-xs text-text-secondary mt-0.5">per 100g</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Beef, label: 'Protein', value: result.protein, color: 'text-red-400', bg: 'bg-red-400/10' },
                    { icon: Wheat, label: 'Carbs', value: result.carbs, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
                    { icon: Flame, label: 'Fat', value: result.fat, color: 'text-orange-400', bg: 'bg-orange-400/10' },
                  ].map(({ icon: Icon, label, value, color, bg }) => (
                    <div key={label} className={`p-3 ${bg} rounded-xl text-center`}>
                      <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
                      <p className="text-sm font-bold text-white">{value}g</p>
                      <p className="text-[10px] text-text-secondary">{label}</p>
                    </div>
                  ))}
                </div>

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

                <Button fullWidth size="lg" loading={saving} onClick={addToLog}>
                  Add to Log
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Card glass className="p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">
            Powered by OpenFoodFacts database with 3M+ products. Nutritional values are per 100g.
          </p>
        </Card>
      </div>
    </div>
  );
}
