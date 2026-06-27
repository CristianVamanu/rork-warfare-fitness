'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Scan, Flame, Beef, Wheat, AlertCircle,
  Smartphone, RefreshCw, ZapOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { logMealAction } from '@/lib/actions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { NutritionAnalysis } from '@/types';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

type CameraState = 'idle' | 'initializing' | 'scanning' | 'denied' | 'error';

// ---------------------------------------------------------------------------
// Root cause of black screen (previous implementation):
//  1. Missing `autoPlay` attribute on <video> — React won't play without it
//  2. No barcode detection library — only a comment placeholder
//  3. iOS Safari: { facingMode: 'environment' } alone can throw OverconstrainedError;
//     needs a two-step fallback to plain { video: true }
//  4. `@zxing/browser` now handles all of the above cross-browser
// ---------------------------------------------------------------------------

export default function BarcodePage() {
  const router = useRouter();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<import('@zxing/browser').BrowserMultiFormatReader | null>(null);
  const scannedRef = useRef(false); // debounce: prevent multiple triggers

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [cameraError, setCameraError] = useState<string>('');
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<NutritionAnalysis | null>(null);
  const [productName, setProductName] = useState('');
  const [mealType, setMealType] = useState<MealType>('snack');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  const stopScanner = useCallback(() => {
    try { readerRef.current?.reset(); } catch { /* noop */ }
    readerRef.current = null;
    scannedRef.current = false;
    if (cameraState === 'scanning' || cameraState === 'initializing') {
      setCameraState('idle');
    }
  }, [cameraState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { readerRef.current?.reset(); } catch { /* noop */ }
    };
  }, []);

  const startScanner = useCallback(async () => {
    if (!videoRef.current) return;
    setCameraState('initializing');
    setCameraError('');
    scannedRef.current = false;

    try {
      // Dynamic import keeps ZXing out of the server bundle
      const { BrowserMultiFormatReader, NotFoundException } = await import('@zxing/browser');
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);
      readerRef.current = reader;

      // List available cameras; prefer the back/environment camera
      let deviceId: string | undefined;
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        console.log('[Barcode] Available cameras:', devices.map((d) => d.label));
        const back = devices.find((d) =>
          /back|rear|environment|0/i.test(d.label)
        );
        deviceId = back?.deviceId ?? devices[0]?.deviceId;
      } catch {
        // listVideoInputDevices can fail before permissions granted — that's fine
        deviceId = undefined;
      }

      setCameraState('scanning');

      await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (scanResult, err) => {
          if (scanResult && !scannedRef.current) {
            scannedRef.current = true;
            const code = scanResult.getText();
            console.log('[Barcode] Detected:', code);
            stopScanner();
            lookupBarcode(code);
          }
          if (err && !(err instanceof NotFoundException)) {
            // NotFoundException fires on every frame with no barcode — ignore it
            console.warn('[Barcode] Scan error:', err?.message ?? err);
          }
        }
      );
    } catch (err: unknown) {
      const e = err as Error & { name?: string };
      console.error('[Barcode] Camera failed:', e?.name, e?.message);
      readerRef.current = null;

      if (e?.name === 'NotAllowedError' || e?.message?.includes('Permission')) {
        setCameraState('denied');
        setCameraError('Camera permission denied. Please allow camera access and try again.');
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        setCameraState('error');
        setCameraError('No camera found on this device.');
      } else if (e?.name === 'OverconstrainedError') {
        // iOS Safari sometimes rejects environment facingMode — retry with default
        console.warn('[Barcode] OverconstrainedError — retrying without facingMode constraint');
        setCameraState('idle');
        // Small delay then retry; ZXing will pick the default camera
        setTimeout(startScanner, 500);
      } else {
        setCameraState('error');
        setCameraError(e?.message || 'Failed to start camera. Use manual entry below.');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookupBarcode = async (code: string) => {
    if (!code.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/nutrition/barcode?code=${encodeURIComponent(code.trim())}`);
      if (!res.ok) throw new Error('Product not found');
      const data = await res.json();
      setResult(data.nutrition);
      setProductName(data.name || data.nutrition?.name || 'Product');
    } catch {
      toast.error('Product not found. Try another barcode or enter manually.');
    } finally {
      setSearching(false);
    }
  };

  const addToLog = async () => {
    if (!result || !user) return;
    setSaving(true);
    try {
      await logMealAction(user.uid, {
        name: productName || result.name,
        calories: result.calories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        mealType,
      });
      toast.success('Added to log!');
      router.replace('/nutrition');
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      const display = e?.code ? `${e.code}: ${e.message}` : (e?.message || 'Save failed');
      toast.error(display, { duration: 8000 });
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/8">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => { stopScanner(); router.back(); }}
            className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-white">Barcode Scanner</h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
        {/* Camera Viewfinder */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="relative aspect-square bg-black rounded-2xl overflow-hidden">

            {/* VIDEO — always in DOM when scanning so ZXing can attach to it */}
            {/* autoPlay is required in React; playsInline prevents fullscreen on iOS */}
            <video
              ref={videoRef}
              className={`w-full h-full object-cover ${
                cameraState === 'scanning' ? 'block' : 'hidden'
              }`}
              autoPlay
              playsInline
              muted
            />

            {/* Scanning overlay */}
            {cameraState === 'scanning' && (
              <>
                {/* Dark vignette outside scan zone */}
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse 55% 30% at 50% 50%, transparent 80%, rgba(0,0,0,0.55) 100%)' }}
                />
                {/* Corner frame */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-2/3 aspect-[3/2]">
                    <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-accent rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-accent rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-accent rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-accent rounded-br-lg" />
                    {/* Scan line */}
                    <motion.div
                      animate={{ top: ['10%', '80%', '10%'] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-x-0 h-0.5 bg-accent/80"
                      style={{ position: 'absolute' }}
                    />
                  </div>
                </div>
                {/* Label */}
                <p className="absolute bottom-4 inset-x-0 text-center text-xs text-white/70">
                  Align barcode within the frame
                </p>
                {/* Stop button */}
                <button
                  onClick={stopScanner}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-black/60 backdrop-blur rounded-lg text-xs text-white flex items-center gap-1.5"
                >
                  <ZapOff className="w-3.5 h-3.5" /> Stop
                </button>
              </>
            )}

            {/* Initializing state */}
            {cameraState === 'initializing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-white/70">Starting camera…</p>
              </div>
            )}

            {/* Idle / start state */}
            {cameraState === 'idle' && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <div className="p-5 bg-accent-muted rounded-full">
                  <Scan className="w-10 h-10 text-accent" />
                </div>
                <button
                  onClick={startScanner}
                  className="px-4 py-2 bg-accent text-black rounded-xl text-sm font-bold"
                >
                  Start Camera
                </button>
              </div>
            )}

            {/* Permission denied */}
            {cameraState === 'denied' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-black text-center">
                <Smartphone className="w-10 h-10 text-text-tertiary" />
                <p className="text-white text-sm font-medium">Camera Permission Denied</p>
                <p className="text-text-secondary text-xs">{cameraError}</p>
                <p className="text-text-tertiary text-xs">Use manual barcode entry below.</p>
              </div>
            )}

            {/* Generic error */}
            {cameraState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-black text-center">
                <AlertCircle className="w-10 h-10 text-danger" />
                <p className="text-white text-sm font-medium">Camera Error</p>
                <p className="text-text-secondary text-xs">{cameraError}</p>
                <button
                  onClick={() => { setCameraState('idle'); setCameraError(''); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-surface-elevated text-white rounded-xl text-xs mt-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Try Again
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Searching indicator */}
        {searching && (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-secondary">Looking up product…</p>
          </div>
        )}

        {/* Manual Entry */}
        <Card className="p-4">
          <p className="text-xs text-text-secondary mb-2">Or enter barcode manually:</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
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
            Powered by OpenFoodFacts (3M+ products). Scans EAN-13, EAN-8, UPC-A, UPC-E, Code128, QR codes. Values are per 100g.
          </p>
        </Card>
      </div>
    </div>
  );
}
