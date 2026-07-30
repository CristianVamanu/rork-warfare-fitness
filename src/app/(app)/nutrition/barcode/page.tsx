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
import { getIdToken } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { logMealAction } from '@/lib/actions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PaywallGate } from '@/components/ui/PaywallGate';
import type { NutritionAnalysis } from '@/types';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface NutrientLevels {
  fat?: 'low' | 'moderate' | 'high';
  'saturated-fat'?: 'low' | 'moderate' | 'high';
  sugars?: 'low' | 'moderate' | 'high';
  salt?: 'low' | 'moderate' | 'high';
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null); // IScannerControls — .stop() actually releases the camera stream
  const scannedRef = useRef(false); // debounce: prevent multiple triggers

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [cameraError, setCameraError] = useState<string>('');
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<NutritionAnalysis | null>(null);
  const [productName, setProductName] = useState('');
  const [nutriScoreGrade, setNutriScoreGrade] = useState<string | null>(null);
  const [novaGroup, setNovaGroup] = useState<number | null>(null);
  const [ecoScoreGrade, setEcoScoreGrade] = useState<string | null>(null);
  const [additives, setAdditives] = useState<string[]>([]);
  const [nutrientLevels, setNutrientLevels] = useState<NutrientLevels | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [showScoreDetail, setShowScoreDetail] = useState(false);
  const [mealType, setMealType] = useState<MealType>('snack');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    getIdToken(user)
      .then((token) => fetch('/api/nutrition/barcode/usage', { headers: { Authorization: `Bearer ${token}` } }))
      .then((res) => res.json())
      .then((data: { remaining?: number }) => { if (typeof data.remaining === 'number') setRemaining(data.remaining); })
      .catch(() => {});
  }, [user]);

  // No cameraState dependency here on purpose: this is called from inside the
  // decodeFromVideoDevice callback, a closure frozen at scanner-start time by
  // startScanner's empty-deps useCallback. A cameraState-gated check here
  // would compare against the stale value from that render and silently skip
  // setCameraState('idle') on a successful scan — the scanner UI would keep
  // showing "scanning" forever even though decoding had already stopped.
  const stopScanner = useCallback(() => {
    // BrowserCodeReader has no reset() method — the object that actually
    // controls (and can release) the camera stream is the `controls` value
    // decodeFromVideoDevice() resolves with, not the reader instance itself.
    try { controlsRef.current?.stop(); } catch { /* noop */ }
    controlsRef.current = null;
    readerRef.current = null;
    scannedRef.current = false;
    setCameraState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { controlsRef.current?.stop(); } catch { /* noop */ }
    };
  }, []);

  const startScanner = useCallback(async () => {
    if (!videoRef.current) return;
    setCameraState('initializing');
    setCameraError('');
    scannedRef.current = false;

    try {
      // Dynamic import keeps ZXing out of the server bundle
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const { NotFoundException } = await import('@zxing/library');
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');

      const hints = new Map();
      // Product barcode formats only — QR_CODE/DATA_MATRIX commonly encode
      // arbitrary URLs/text, not product identifiers, and a stray QR scan
      // would pass a URL-shaped string through as a "barcode", breaking the
      // OpenFoodFacts lookup request downstream.
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
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

      controlsRef.current = await reader.decodeFromVideoDevice(
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
    const trimmed = code.trim();
    if (!trimmed) return;
    if (remaining === 0) {
      toast.error('No scans left today — try again tomorrow');
      return;
    }
    // Product barcodes are numeric (EAN-8/13, UPC-A/E, sometimes padded Code128).
    // Anything else (e.g. a stray QR/URL scan) can't be a valid product code.
    if (!/^\d{6,14}$/.test(trimmed)) {
      toast.error('That doesn\'t look like a product barcode. Try scanning again or enter the numbers manually.');
      return;
    }
    setSearching(true);
    setNutriScoreGrade(null);
    setNovaGroup(null);
    setEcoScoreGrade(null);
    setAdditives([]);
    setNutrientLevels(null);
    setLabels([]);
    try {
      if (!user) throw new Error('Not signed in');
      const token = await getIdToken(user);
      const res = await fetch(`/api/nutrition/barcode?code=${encodeURIComponent(trimmed)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (typeof data.remaining === 'number') setRemaining(data.remaining);
      if (!res.ok) throw new Error(data.error || 'Product not found');
      setResult(data.nutrition);
      setProductName(data.name || data.nutrition?.name || 'Product');
      setNutriScoreGrade(data.nutriScoreGrade ?? null);
      setNovaGroup(data.novaGroup ?? null);
      setEcoScoreGrade(data.ecoScoreGrade ?? null);
      setAdditives(data.additives ?? []);
      setNutrientLevels(data.nutrientLevels ?? null);
      setLabels(data.labels ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Product not found. Try another barcode or enter manually.');
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
    <PaywallGate feature="barcode">
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
        {remaining !== null && (
          <p className={`text-xs font-semibold text-center ${remaining === 0 ? 'text-red-400' : 'text-text-tertiary'}`}>
            {remaining === 0 ? 'No scans left today — try again tomorrow' : `${remaining} scan${remaining === 1 ? '' : 's'} left today`}
          </p>
        )}
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
            <Button loading={searching} disabled={remaining === 0} onClick={() => lookupBarcode(manualCode)} size="sm">
              Search
            </Button>
          </div>
        </Card>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white">{productName || result.name}</h3>
                    <p className="text-2xl font-black text-accent mt-1">{result.calories} kcal</p>
                    <p className="text-xs text-text-secondary mt-0.5">per 100g</p>
                  </div>
                  {(nutriScoreGrade || novaGroup) && (
                    <button onClick={() => setShowScoreDetail(true)} className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {nutriScoreGrade && <NutriScoreBadge grade={nutriScoreGrade} />}
                      {novaGroup && <NovaBadge group={novaGroup} />}
                      <span className="text-[9px] text-accent underline">Tap for details</span>
                    </button>
                  )}
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
            Powered by OpenFoodFacts (3M+ products). Scans EAN-13, EAN-8, UPC-A, UPC-E, Code128 product barcodes. Values are per 100g.
            Nutri-Score and NOVA processing grade shown when available in the OpenFoodFacts database.
          </p>
        </Card>
      </div>

      <Modal open={showScoreDetail} onClose={() => setShowScoreDetail(false)} title={productName || 'Health Score'}>
        <div className="space-y-4">
          {nutriScoreGrade && (
            <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black flex-shrink-0 ${NUTRISCORE_COLORS[nutriScoreGrade] ?? 'bg-surface text-white'}`}>
                {nutriScoreGrade.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold text-white">Nutri-Score {nutriScoreGrade.toUpperCase()}</p>
                <p className="text-xs text-text-secondary">
                  Overall nutritional quality, based on calories, sugar, saturated fat, salt vs. fiber and protein.
                </p>
              </div>
            </div>
          )}

          {novaGroup && NOVA_LABELS[novaGroup] && (
            <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl">
              <div className={`w-12 h-12 rounded-xl bg-surface flex items-center justify-center text-xl font-black flex-shrink-0 ${NOVA_LABELS[novaGroup].color}`}>
                {novaGroup}
              </div>
              <div>
                <p className="text-sm font-bold text-white">NOVA {novaGroup} — {NOVA_LABELS[novaGroup].label}</p>
                <p className="text-xs text-text-secondary">{NOVA_DESCRIPTIONS[novaGroup]}</p>
              </div>
            </div>
          )}

          {ecoScoreGrade && (
            <div className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black flex-shrink-0 ${NUTRISCORE_COLORS[ecoScoreGrade] ?? 'bg-surface text-white'}`}>
                {ecoScoreGrade.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold text-white">Eco-Score {ecoScoreGrade.toUpperCase()}</p>
                <p className="text-xs text-text-secondary">Estimated environmental impact of this product.</p>
              </div>
            </div>
          )}

          {nutrientLevels && Object.keys(nutrientLevels).length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Nutrient Levels (per 100g)</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(nutrientLevels) as [keyof NutrientLevels, string][]).map(([key, level]) => (
                  <div key={key} className="p-2.5 bg-surface-elevated rounded-lg flex items-center justify-between">
                    <span className="text-xs text-text-secondary capitalize">{key.replace('-', ' ')}</span>
                    <span className={`text-xs font-bold ${
                      level === 'low' ? 'text-green-400' : level === 'moderate' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {level}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {additives.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Additives ({additives.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {additives.map((a) => (
                  <span key={a} className="text-[10px] px-2 py-1 bg-surface-elevated rounded-md text-text-secondary">{a}</span>
                ))}
              </div>
            </div>
          )}

          {labels.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-2">Labels</p>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <span key={l} className="text-[10px] px-2 py-1 bg-accent/10 border border-accent/20 rounded-md text-accent">{l}</span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-text-tertiary pt-2 border-t border-white/8">
            Data from OpenFoodFacts, a free open database. Scores reflect the product as sold, not how you prepare or portion it.
          </p>
        </div>
      </Modal>
    </div>
    </PaywallGate>
  );
}

const NUTRISCORE_COLORS: Record<string, string> = {
  a: 'bg-green-500 text-black',
  b: 'bg-lime-400 text-black',
  c: 'bg-yellow-400 text-black',
  d: 'bg-orange-500 text-black',
  e: 'bg-red-500 text-white',
};

function NutriScoreBadge({ grade }: { grade: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black ${NUTRISCORE_COLORS[grade] ?? 'bg-surface-elevated text-white'}`}>
        {grade.toUpperCase()}
      </div>
      <span className="text-[10px] text-text-tertiary">Nutri-Score</span>
    </div>
  );
}

const NOVA_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Unprocessed', color: 'text-green-400' },
  2: { label: 'Processed culinary', color: 'text-lime-400' },
  3: { label: 'Processed', color: 'text-orange-400' },
  4: { label: 'Ultra-processed', color: 'text-red-400' },
};

const NOVA_DESCRIPTIONS: Record<number, string> = {
  1: 'Unprocessed or minimally processed foods — no or minimal alteration from their natural state.',
  2: 'Processed culinary ingredients — oils, butter, sugar, salt, used to prepare food at home.',
  3: 'Processed foods — canned, bottled, or baked with added salt, sugar, or oil.',
  4: 'Ultra-processed foods — industrial formulations with additives rarely used in home cooking.',
};

function NovaBadge({ group }: { group: number }) {
  const info = NOVA_LABELS[group];
  if (!info) return null;
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-7 h-7 rounded-lg bg-surface-elevated flex items-center justify-center text-sm font-black ${info.color}`}>
        {group}
      </div>
      <span className="text-[10px] text-text-tertiary">{info.label}</span>
    </div>
  );
}
