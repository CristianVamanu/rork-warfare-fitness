import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  Image as RNImage, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { Camera, Image as ImageIcon, Plus, Check, Barcode, X, Scan } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { trpc } from '@/lib/trpc';

export default function FoodScannerScreen() {
  const insets = useSafeAreaInsets();
  const { addMeal, calorieTarget, setDailyCalorieTarget, getTodayMeals, adminSettings } = useApp();
  const [permission, requestPermission] = useCameraPermissions();

  const [view, setView] = useState<'idle' | 'barcode'>('idle');
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [picked, setPicked] = useState<{ uri: string; base64?: string } | undefined>(undefined);
  const [calInput, setCalInput] = useState(String(calorieTarget));
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [nutrition, setNutrition] = useState<{
    name: string; calories: number; protein: number; carbs: number; fat: number;
  } | undefined>(undefined);
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');

  const scanMutation = trpc.food.scan.useMutation({
    onSuccess: (data) => { setNutrition(data); setLoading(false); },
    onError: (err) => { setError(err.message || 'Failed to analyze. Please try again.'); setLoading(false); },
  });

  const analyzeWithAI = (base64: string) => {
    setLoading(true);
    setError(undefined);
    setNutrition(undefined);
    scanMutation.mutate({ base64Image: base64, apiKey: adminSettings.aiApiKey || undefined });
  };

  const lookupBarcode = async (barcode: string) => {
    setLoading(true);
    setError(undefined);
    setNutrition(undefined);
    setView('idle');
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const json = await res.json();
      if (json.status === 1 && json.product) {
        const p = json.product;
        const n = p.nutriments ?? {};
        setNutrition({
          name: p.product_name ?? p.abbreviated_product_name ?? 'Unknown product',
          calories: Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0),
          protein: Math.round((n.proteins_100g ?? n.proteins ?? 0) * 10) / 10,
          carbs: Math.round((n.carbohydrates_100g ?? n.carbohydrates ?? 0) * 10) / 10,
          fat: Math.round((n.fat_100g ?? n.fat ?? 0) * 10) / 10,
        });
      } else {
        setError('Product not found. Try taking a photo of the food instead.');
      }
    } catch {
      setError('Could not look up product. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const onBarcodeDetected = ({ data }: { data: string }) => {
    if (barcodeScanned) return;
    setBarcodeScanned(true);
    void lookupBarcode(data);
  };

  const openCamera = async () => {
    setError(undefined);
    if (Platform.OS === 'web') {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true, quality: 0.8, allowsEditing: true,
      });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        setPicked({ uri: a.uri, base64: a.base64 ?? undefined });
      }
      return;
    }
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) { setError('Camera permission denied'); return; }
    }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setPicked({ uri: a.uri, base64: a.base64 ?? undefined });
    }
  };

  const openGallery = async () => {
    setError(undefined);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true, quality: 0.8, allowsEditing: true,
    });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setPicked({ uri: a.uri, base64: a.base64 ?? undefined });
    }
  };

  const openBarcode = async () => {
    setError(undefined);
    if (Platform.OS === 'web') {
      // Web: pick a photo, try BarcodeDetector (Chrome Android), else analyze as food
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true, quality: 0.9,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setPicked({ uri: a.uri, base64: a.base64 ?? undefined });
      if (typeof (window as any).BarcodeDetector !== 'undefined') {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'code_128'],
          });
          const img = new window.Image();
          img.src = a.uri;
          await new Promise(r => { img.onload = r; img.onerror = r; });
          const codes = await detector.detect(img);
          if (codes?.length > 0) {
            await lookupBarcode(codes[0].rawValue as string);
            return;
          }
        } catch { /* fall through */ }
      }
      // No barcode found — let user tap Analyze to use AI vision
      setError('No barcode found in image. Tap "Analyze Food Photo" to identify food by AI.');
      return;
    }
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) { setError('Camera permission denied'); return; }
    }
    setBarcodeScanned(false);
    setView('barcode');
  };

  const addToLog = () => {
    if (!nutrition) return;
    addMeal({
      name: nutrition.name, calories: nutrition.calories,
      protein: nutrition.protein, carbs: nutrition.carbs,
      fat: nutrition.fat, mealType, imageUri: picked?.uri,
    });
    setPicked(undefined);
    setNutrition(undefined);
    setError(undefined);
    setMealType('lunch');
  };

  // ── Barcode scanner fullscreen view (native only) ──────────────────────────
  if (view === 'barcode') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Stack.Screen options={{
          title: 'Scan Barcode',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
        }} />
        {loading ? (
          <View style={styles.fullCenter}>
            <ActivityIndicator color={Colors.accent} size="large" />
            <Text style={styles.loadingText}>Looking up product…</Text>
          </View>
        ) : (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={onBarcodeDetected}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
            }}
          >
            <View style={styles.barcodeOverlay}>
              <TouchableOpacity
                style={[styles.closeBtn, { top: insets.top + 12 }]}
                onPress={() => setView('idle')}
              >
                <X size={24} color="#fff" />
              </TouchableOpacity>

              <View style={styles.scannerFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>

              <Text style={styles.scannerHint}>Point at a product barcode</Text>
            </View>
          </CameraView>
        )}
      </View>
    );
  }

  // ── Main screen ────────────────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen options={{
        title: 'AI Food Scanner',
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerShadowVisible: false,
      }} />
      <ScrollView
        style={{ backgroundColor: Colors.background }}
        contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* ── Scan card ── */}
        <View style={styles.card}>
          <Text style={styles.title}>Scan Your Meal</Text>
          <Text style={styles.sub}>Take a photo or scan a barcode for instant nutrition info</Text>

          {picked?.uri && (
            <RNImage source={{ uri: picked.uri }} style={styles.preview} />
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={openCamera}>
              <Camera size={18} color={Colors.background} />
              <Text style={styles.actionBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={openGallery}>
              <ImageIcon size={18} color={Colors.background} />
              <Text style={styles.actionBtnText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.barcodeBtnOutline]} onPress={openBarcode}>
              <Barcode size={18} color={Colors.accent} />
              <Text style={[styles.actionBtnText, { color: Colors.accent }]}>Barcode</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.analyzeBtn, (!picked?.base64 || loading) && styles.analyzeBtnDisabled]}
            onPress={() => picked?.base64 && analyzeWithAI(picked.base64)}
            disabled={loading || !picked?.base64}
          >
            {loading
              ? <ActivityIndicator color={Colors.background} size="small" />
              : <Scan size={18} color={Colors.background} />}
            <Text style={styles.analyzeBtnText}>
              {loading ? 'Analyzing…' : 'Analyze Food Photo'}
            </Text>
          </TouchableOpacity>

          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        {/* ── Nutrition result ── */}
        {nutrition && (
          <View style={styles.card}>
            <Text style={styles.title}>{nutrition.name}</Text>
            <View style={styles.macroRow}>
              <View style={styles.macroItem}>
                <Text style={styles.macroVal}>{nutrition.calories}</Text>
                <Text style={styles.macroLabel}>kcal</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={styles.macroVal}>{nutrition.protein}g</Text>
                <Text style={styles.macroLabel}>Protein</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={styles.macroVal}>{nutrition.carbs}g</Text>
                <Text style={styles.macroLabel}>Carbs</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={styles.macroVal}>{nutrition.fat}g</Text>
                <Text style={styles.macroLabel}>Fat</Text>
              </View>
            </View>

            <Text style={[styles.sub, { marginTop: 16 }]}>Add as</Text>
            <View style={[styles.btnRow, { flexWrap: 'wrap', justifyContent: 'flex-start' }]}>
              {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mt => (
                <TouchableOpacity
                  key={mt}
                  style={[styles.mealChip, mealType === mt && styles.mealChipActive]}
                  onPress={() => setMealType(mt)}
                >
                  <Text style={[styles.mealChipText, mealType === mt && styles.mealChipTextActive]}>
                    {mt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.addBtn} onPress={addToLog}>
              <Plus size={18} color={Colors.background} />
              <Text style={styles.actionBtnText}>Add to log</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Daily calorie target ── */}
        <View style={styles.card}>
          <Text style={styles.title}>Daily Calories</Text>
          <Text style={styles.sub}>Set your target</Text>
          <View style={styles.btnRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              keyboardType="numeric"
              placeholder="e.g. 2400"
              placeholderTextColor={Colors.textSecondary}
              value={calInput}
              onChangeText={setCalInput}
            />
            <TouchableOpacity style={styles.actionBtn} onPress={() => {
              const v = parseInt(calInput || '0', 10);
              if (Number.isFinite(v) && v > 0) setDailyCalorieTarget(v);
            }}>
              <Check size={18} color={Colors.background} />
              <Text style={styles.actionBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Today's log ── */}
        <View style={styles.card}>
          <Text style={styles.title}>{"Today's Nutrition"}</Text>
          {(() => {
            const meals = getTodayMeals();
            const total = meals.reduce((s, m) => s + (m.calories ?? 0), 0);
            const pct = Math.min(100, Math.round((total / (calorieTarget || 1)) * 100));
            return (
              <>
                <View style={styles.progressWrap}>
                  <View style={styles.progressOuter}>
                    <View style={[styles.progressInner, { width: `${pct}%` as any }]} />
                  </View>
                  <Text style={styles.progressText}>{total} / {calorieTarget} kcal</Text>
                </View>
                {meals.map(m => (
                  <View key={m.id} style={styles.mealRow}>
                    <Text style={styles.mealName} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.mealMeta}>{m.mealType} • {m.calories} kcal</Text>
                  </View>
                ))}
                {meals.length === 0 && <Text style={styles.sub}>No meals yet. Scan your first meal.</Text>}
              </>
            );
          })()}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { padding: 16, backgroundColor: Colors.background },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, marginBottom: 16,
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: '900' as const },
  sub: { color: Colors.textSecondary, marginTop: 4, marginBottom: 8, fontWeight: '600' as const },
  preview: { width: '100%', height: 220, borderRadius: 12, marginVertical: 12 },
  btnRow: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
  },
  actionBtnText: { color: Colors.background, fontWeight: '900' as const },
  barcodeBtnOutline: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent,
  },
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    backgroundColor: Colors.accent, paddingVertical: 13, borderRadius: 10, marginTop: 10,
  },
  analyzeBtnDisabled: { opacity: 0.45 },
  analyzeBtnText: { color: Colors.background, fontWeight: '900' as const, fontSize: 15 },
  error: { color: Colors.danger, marginTop: 10, fontWeight: '600' as const },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  macroItem: { alignItems: 'center' },
  macroVal: { color: Colors.text, fontSize: 22, fontWeight: '900' as const },
  macroLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const, marginTop: 2 },
  mealChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    marginRight: 6, marginBottom: 6,
  },
  mealChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  mealChipText: { color: Colors.text, fontWeight: '800' as const, textTransform: 'capitalize' as const },
  mealChipTextActive: { color: Colors.background },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
    backgroundColor: Colors.accent, paddingVertical: 12, borderRadius: 10, marginTop: 12,
  },
  input: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: Colors.text,
  },
  progressWrap: { marginTop: 8, marginBottom: 12 },
  progressOuter: { height: 10, backgroundColor: Colors.surfaceLight, borderRadius: 6, overflow: 'hidden' },
  progressInner: { height: '100%', backgroundColor: Colors.accent },
  progressText: { color: Colors.textSecondary, marginTop: 6, fontWeight: '700' as const },
  mealRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    padding: 10, borderRadius: 10, gap: 8, marginBottom: 6,
  },
  mealName: { color: Colors.text, fontWeight: '800' as const, flex: 1 },
  mealMeta: { color: Colors.textSecondary, fontWeight: '700' as const },

  // Barcode scanner styles (copied from barcode-scanner.tsx pattern)
  fullCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  loadingText: { color: '#fff', marginTop: 16, fontWeight: '600' as const },
  barcodeOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', gap: 24,
  },
  closeBtn: {
    position: 'absolute' as const, right: 20,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  scannerFrame: {
    width: 280, height: 200, position: 'relative' as const,
  },
  corner: {
    position: 'absolute' as const, width: 36, height: 36, borderColor: Colors.accent,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  scannerHint: {
    color: '#fff', fontSize: 16, fontWeight: '700' as const,
    textShadowColor: '#000', textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
});
