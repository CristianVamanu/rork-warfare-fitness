import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image as RNImage, TextInput, ActivityIndicator, Animated, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { Camera, Image as ImageIcon, Plus, Check, Barcode } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';

import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { trpc } from '@/lib/trpc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type CameraMode = 'photo' | 'barcode' | null;

export default function FoodScannerScreen() {
  const insets = useSafeAreaInsets();
  const { addMeal, calorieTarget, setDailyCalorieTarget, getTodayMeals, adminSettings } = useApp();

  const [picked, setPicked] = useState<{ uri: string; base64?: string } | undefined>(undefined);
  const [calInput, setCalInput] = useState<string>(String(calorieTarget));
  const [error, setError] = useState<string | undefined>(undefined);
  const [nutrition, setNutrition] = useState<{
    name: string; calories: number; protein: number; carbs: number; fat: number;
  } | undefined>(undefined);
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [radarAnim] = useState(new Animated.Value(0));

  const scanMutation = trpc.food.scan.useMutation({
    onSuccess: (data) => {
      setNutrition(data);
      radarAnim.stopAnimation();
      radarAnim.setValue(0);
    },
    onError: (err) => {
      setError(err.message || 'Failed to analyze. Please try again.');
      radarAnim.stopAnimation();
      radarAnim.setValue(0);
    },
  });

  const barcodeMutation = trpc.food.scan.useMutation({
    onSuccess: (data) => {
      setNutrition(data);
      setCameraMode(null);
      setBarcodeScanned(false);
    },
    onError: (err) => {
      setError(err.message || 'Could not look up barcode. Try scanning food instead.');
      setCameraMode(null);
      setBarcodeScanned(false);
    },
  });

  const pickImage = async () => {
    setError(undefined);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (asset) setPicked({ uri: asset.uri, base64: asset.base64 ?? undefined });
  };

  const openCamera = async (mode: CameraMode) => {
    if (Platform.OS === 'web') { await pickImage(); return; }
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) { setError('Camera permission denied'); return; }
    }
    setBarcodeScanned(false);
    setCameraMode(mode);
  };

  const scan = () => {
    if (!picked?.base64) { setError('Select a food photo first'); return; }
    setError(undefined);
    setNutrition(undefined);
    const radarLoop = Animated.loop(
      Animated.timing(radarAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
    );
    radarLoop.start();
    scanMutation.mutate({ base64Image: picked.base64, apiKey: adminSettings.aiApiKey || undefined });
  };

  const onBarcodeScanned = async ({ data: barcode }: { data: string }) => {
    if (barcodeScanned) return;
    setBarcodeScanned(true);
    setError(undefined);
    setNutrition(undefined);

    // Look up barcode via Open Food Facts (free, no key needed)
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
        setCameraMode(null);
      } else {
        // Barcode not in database — ask AI with the barcode number
        barcodeMutation.mutate({
          base64Image: btoa(`barcode:${barcode}`),
          apiKey: adminSettings.aiApiKey || undefined,
        });
      }
    } catch {
      setError('Could not look up barcode. Check your connection.');
      setCameraMode(null);
      setBarcodeScanned(false);
    }
  };

  const addToLog = () => {
    if (!nutrition) return;
    addMeal({ name: nutrition.name, calories: nutrition.calories, protein: nutrition.protein, carbs: nutrition.carbs, fat: nutrition.fat, mealType, imageUri: picked?.uri });
    setPicked(undefined);
    setNutrition(undefined);
    setMealType('lunch');
    setError(undefined);
  };

  // Camera view (photo or barcode)
  if (cameraMode && Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: cameraMode === 'barcode' ? 'Scan Barcode' : 'Take Photo', headerStyle: { backgroundColor: '#000' }, headerTintColor: '#fff' }} />
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          onBarcodeScanned={cameraMode === 'barcode' ? onBarcodeScanned : undefined}
          barcodeScannerSettings={cameraMode === 'barcode' ? { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] } : undefined}
        >
          {cameraMode === 'barcode' ? (
            <View style={styles.barcodeOverlay}>
              <View style={styles.barcodeFrame} />
              <Text style={styles.barcodeHint}>Point at a food barcode</Text>
              <TouchableOpacity style={styles.cameraBtn} onPress={() => setCameraMode(null)}>
                <Text style={styles.cameraBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: 'flex-end', padding: 20 }}>
              <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-around' }}>
                <TouchableOpacity style={styles.cameraBtn} onPress={() => setCameraMode(null)}>
                  <Text style={styles.cameraBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cameraBtn, styles.cameraCaptureBtn]}
                  onPress={async () => {
                    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
                    if (!result.canceled && result.assets?.[0]) {
                      const asset = result.assets[0];
                      setPicked({ uri: asset.uri, base64: asset.base64 ?? undefined });
                    }
                    setCameraMode(null);
                  }}
                >
                  <Text style={styles.cameraBtnText}>Capture</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </CameraView>
      </View>
    );
  }

  const loading = scanMutation.isPending || barcodeMutation.isPending;

  return (
    <>
      <Stack.Screen options={{ title: 'AI Food Scanner', headerStyle: { backgroundColor: Colors.background }, headerTintColor: Colors.text, headerShadowVisible: false }} />
      <ScrollView style={{ backgroundColor: Colors.background }} contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.card}>
          <Text style={styles.title}>Scan your meal</Text>
          <Text style={styles.sub}>Photo scan or barcode — get instant nutrition</Text>

          {picked?.uri ? (
            <View>
              <RNImage source={{ uri: picked.uri }} style={styles.preview} />
              {loading && (
                <View style={styles.radarContainer}>
                  <Animated.View style={[styles.radarRing, {
                    opacity: radarAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 0.3, 0] }),
                    transform: [{ scale: radarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2] }) }],
                  }]} />
                  <View style={styles.radarCenter} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.previewPlaceholder}>
              {loading && <ActivityIndicator color={Colors.accent} size="large" />}
            </View>
          )}

          <View style={styles.row}>
            <TouchableOpacity style={styles.btn} onPress={() => openCamera('photo')}>
              <Camera size={18} color={Colors.background} />
              <Text style={styles.btnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={pickImage}>
              <ImageIcon size={18} color={Colors.background} />
              <Text style={styles.btnText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent }]} onPress={() => openCamera('barcode')}>
              <Barcode size={18} color={Colors.accent} />
              <Text style={[styles.btnText, { color: Colors.accent }]}>Barcode</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.analyzeBtn, (!picked || loading) && styles.analyzeBtnDisabled]} onPress={scan} disabled={loading || !picked}>
            {loading ? <ActivityIndicator color={Colors.background} /> : <Camera size={18} color={Colors.background} />}
            <Text style={styles.analyzeBtnText}>{loading ? 'Analyzing...' : 'Analyze Food Photo'}</Text>
          </TouchableOpacity>

          {error && <Text style={styles.error}>{error}</Text>}

          {nutrition && (
            <View style={styles.nutrition}>
              <Text style={styles.nutTitle}>{nutrition.name}</Text>
              <View style={styles.nutRow}><Text style={styles.kvLabel}>Calories</Text><Text style={styles.kvValue}>{nutrition.calories} kcal</Text></View>
              <View style={styles.nutRow}><Text style={styles.kvLabel}>Protein</Text><Text style={styles.kvValue}>{nutrition.protein} g</Text></View>
              <View style={styles.nutRow}><Text style={styles.kvLabel}>Carbs</Text><Text style={styles.kvValue}>{nutrition.carbs} g</Text></View>
              <View style={styles.nutRow}><Text style={styles.kvLabel}>Fat</Text><Text style={styles.kvValue}>{nutrition.fat} g</Text></View>

              <Text style={[styles.sub, { marginTop: 12 }]}>Add as</Text>
              <View style={[styles.row, { justifyContent: 'flex-start', flexWrap: 'wrap' }]}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mt => (
                  <TouchableOpacity key={mt} style={[styles.mealChip, mealType === mt && styles.mealChipActive]} onPress={() => setMealType(mt)}>
                    <Text style={[styles.mealChipText, mealType === mt && styles.mealChipTextActive]}>{mt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[styles.btn, { marginTop: 12 }]} onPress={addToLog}>
                <Plus size={18} color={Colors.background} />
                <Text style={styles.btnText}>Add to log</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Daily Calories</Text>
          <Text style={styles.sub}>Set your target</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              keyboardType="numeric"
              placeholder="e.g. 2400"
              placeholderTextColor={Colors.textSecondary}
              value={calInput}
              onChangeText={setCalInput}
            />
            <TouchableOpacity style={styles.btn} onPress={() => {
              const v = parseInt(calInput || '0', 10);
              if (Number.isFinite(v) && v > 0) setDailyCalorieTarget(v);
            }}>
              <Check size={18} color={Colors.background} />
              <Text style={styles.btnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{"Today's Nutrition"}</Text>
          <Text style={styles.sub}>Logged meals and progress</Text>
          {(() => {
            const todayMeals = getTodayMeals();
            const total = todayMeals.reduce((sum, m) => sum + (m.calories ?? 0), 0);
            const pct = Math.min(100, Math.round((total / (calorieTarget || 1)) * 100));
            return (
              <>
                <View style={styles.progressWrap}>
                  <View style={styles.progressBarOuter}>
                    <View style={[styles.progressBarInner, { width: `${pct}%` as any }]} />
                  </View>
                  <Text style={styles.progressText}>{total} / {calorieTarget} kcal</Text>
                </View>
                <View style={{ gap: 8 }}>
                  {todayMeals.map(m => (
                    <View key={m.id} style={styles.mealRow}>
                      <Text style={styles.mealName} numberOfLines={1} ellipsizeMode="tail">{m.name}</Text>
                      <Text style={styles.mealMeta}>{m.mealType} • {m.calories} kcal</Text>
                    </View>
                  ))}
                  {todayMeals.length === 0 && <Text style={styles.sub}>No meals yet. Scan your first meal.</Text>}
                </View>
              </>
            );
          })()}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { padding: 16, backgroundColor: Colors.background },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16 },
  title: { color: Colors.text, fontSize: 18, fontWeight: '900' as const },
  sub: { color: Colors.textSecondary, marginTop: 4, marginBottom: 8, fontWeight: '600' as const },
  preview: { width: '100%', height: 220, borderRadius: 12, marginTop: 8, marginBottom: 8 },
  previewPlaceholder: { width: '100%', height: 120, borderRadius: 12, marginTop: 8, marginBottom: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  btnText: { color: Colors.background, fontWeight: '900' as const },
  error: { color: Colors.danger, marginTop: 8, fontWeight: '600' as const },
  nutrition: { marginTop: 8 },
  progressWrap: { marginTop: 8, marginBottom: 8 },
  progressBarOuter: { height: 10, backgroundColor: Colors.surfaceLight, borderRadius: 6, overflow: 'hidden' },
  progressBarInner: { height: '100%', backgroundColor: Colors.accent },
  progressText: { color: Colors.textSecondary, marginTop: 6, fontWeight: '700' as const },
  mealRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, padding: 10, borderRadius: 10, gap: 8 },
  mealName: { color: Colors.text, fontWeight: '800' as const, flex: 1 },
  mealMeta: { color: Colors.textSecondary, fontWeight: '700' as const },
  nutTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' as const, marginBottom: 8 },
  nutRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  kvLabel: { color: Colors.textSecondary, fontWeight: '600' as const },
  kvValue: { color: Colors.text, fontWeight: '800' as const },
  mealChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, marginRight: 6, marginBottom: 6 },
  mealChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  mealChipText: { color: Colors.text, fontWeight: '800' as const, textTransform: 'capitalize' as const },
  mealChipTextActive: { color: Colors.background },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: Colors.text },
  cameraBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cameraCaptureBtn: { backgroundColor: Colors.accent },
  cameraBtnText: { color: '#fff', fontWeight: '900' as const },
  radarContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  radarRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: Colors.accent },
  radarCenter: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.accent },
  analyzeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, justifyContent: 'center', marginTop: 8 },
  analyzeBtnDisabled: { opacity: 0.5 },
  analyzeBtnText: { color: Colors.background, fontWeight: '900' as const },
  barcodeOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  barcodeFrame: { width: 260, height: 160, borderWidth: 3, borderColor: Colors.accent, borderRadius: 12, backgroundColor: 'transparent' },
  barcodeHint: { color: '#fff', fontSize: 16, fontWeight: '700' as const, textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
});
