import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, Platform, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { X, Scan, Package, Flame, Apple, Droplet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';

interface NutritionalInfo {
  product_name: string;
  brands?: string;
  nutriments: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    sugars_100g?: number;
    fiber_100g?: number;
    sodium_100g?: number;
  };
  serving_size?: string;
  image_url?: string;
}

export default function BarcodeScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nutritionalInfo, setNutritionalInfo] = useState<NutritionalInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Limited Web Support',
        'Barcode scanning on web has limited browser support. For best results, use a mobile device.',
        [{ text: 'OK' }]
      );
    }
  }, []);

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    
    console.log('Barcode scanned:', { type, data });
    setScanned(true);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`);
      const result = await response.json();

      console.log('API Response:', result);

      if (result.status === 1 && result.product) {
        setNutritionalInfo(result.product);
      } else {
        setError('Product not found in database. Try another barcode.');
      }
    } catch (err) {
      console.error('Error fetching product info:', err);
      setError('Failed to fetch product information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setNutritionalInfo(null);
    setError(null);
    setLoading(false);
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.permissionContainer}>
          <Package size={64} color={Colors.accent} />
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionMessage}>
            We need camera access to scan barcodes and provide nutritional information.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {!scanned && !nutritionalInfo && (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
            }}
          >
            <View style={styles.overlay}>
              <TouchableOpacity
                style={[styles.closeIconButton, { top: insets.top + 60 }]}
                onPress={() => router.back()}
              >
                <X size={28} color="#fff" />
              </TouchableOpacity>

              <View style={styles.scannerGuide}>
                <View style={styles.scannerFrame}>
                  <View style={[styles.corner, styles.cornerTopLeft]} />
                  <View style={[styles.corner, styles.cornerTopRight]} />
                  <View style={[styles.corner, styles.cornerBottomLeft]} />
                  <View style={[styles.corner, styles.cornerBottomRight]} />
                </View>
                <View style={styles.instructionsContainer}>
                  <Scan size={32} color="#fff" />
                  <Text style={styles.instructionsTitle}>Scan Product Barcode</Text>
                  <Text style={styles.instructionsText}>
                    Position the barcode within the frame
                  </Text>
                </View>
              </View>
            </View>
          </CameraView>
        </View>
      )}

      {loading && (
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Fetching product information...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
          <Package size={64} color={Colors.danger} />
          <Text style={styles.errorTitle}>Oops!</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={resetScanner}>
            <Scan size={20} color={Colors.text} />
            <Text style={styles.retryButtonText}>Scan Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}

      {nutritionalInfo && !loading && (
        <ScrollView 
          style={styles.resultsContainer} 
          contentContainerStyle={{ paddingTop: insets.top + 60, paddingBottom: 40 }}
        >
          <TouchableOpacity
            style={[styles.closeIconButton, { top: insets.top + 60 }]}
            onPress={() => router.back()}
          >
            <X size={28} color={Colors.text} />
          </TouchableOpacity>

          <View style={styles.productHeader}>
            <Package size={48} color={Colors.accent} />
            <Text style={styles.productName}>{nutritionalInfo.product_name || 'Unknown Product'}</Text>
            {nutritionalInfo.brands && (
              <Text style={styles.brandName}>{nutritionalInfo.brands}</Text>
            )}
          </View>

          <View style={styles.nutritionCard}>
            <Text style={styles.cardTitle}>Nutritional Information</Text>
            <Text style={styles.servingSize}>
              Per 100g {nutritionalInfo.serving_size ? `(Serving: ${nutritionalInfo.serving_size})` : ''}
            </Text>

            <View style={styles.nutrientsList}>
              {nutritionalInfo.nutriments['energy-kcal_100g'] !== undefined && (
                <View style={styles.nutrientRow}>
                  <View style={styles.nutrientIcon}>
                    <Flame size={24} color="#F59E0B" />
                  </View>
                  <View style={styles.nutrientInfo}>
                    <Text style={styles.nutrientLabel}>Calories</Text>
                    <Text style={styles.nutrientValue}>
                      {nutritionalInfo.nutriments['energy-kcal_100g'].toFixed(0)} kcal
                    </Text>
                  </View>
                </View>
              )}

              {nutritionalInfo.nutriments.proteins_100g !== undefined && (
                <View style={styles.nutrientRow}>
                  <View style={styles.nutrientIcon}>
                    <Apple size={24} color="#10B981" />
                  </View>
                  <View style={styles.nutrientInfo}>
                    <Text style={styles.nutrientLabel}>Protein</Text>
                    <Text style={styles.nutrientValue}>
                      {nutritionalInfo.nutriments.proteins_100g.toFixed(1)}g
                    </Text>
                  </View>
                </View>
              )}

              {nutritionalInfo.nutriments.carbohydrates_100g !== undefined && (
                <View style={styles.nutrientRow}>
                  <View style={styles.nutrientIcon}>
                    <Package size={24} color="#3B82F6" />
                  </View>
                  <View style={styles.nutrientInfo}>
                    <Text style={styles.nutrientLabel}>Carbohydrates</Text>
                    <Text style={styles.nutrientValue}>
                      {nutritionalInfo.nutriments.carbohydrates_100g.toFixed(1)}g
                    </Text>
                  </View>
                </View>
              )}

              {nutritionalInfo.nutriments.sugars_100g !== undefined && (
                <View style={styles.nutrientRow}>
                  <View style={styles.nutrientIcon}>
                    <Droplet size={24} color="#EC4899" />
                  </View>
                  <View style={styles.nutrientInfo}>
                    <Text style={styles.nutrientLabel}>Sugars</Text>
                    <Text style={styles.nutrientValue}>
                      {nutritionalInfo.nutriments.sugars_100g.toFixed(1)}g
                    </Text>
                  </View>
                </View>
              )}

              {nutritionalInfo.nutriments.fat_100g !== undefined && (
                <View style={styles.nutrientRow}>
                  <View style={styles.nutrientIcon}>
                    <Droplet size={24} color="#EF4444" />
                  </View>
                  <View style={styles.nutrientInfo}>
                    <Text style={styles.nutrientLabel}>Fat</Text>
                    <Text style={styles.nutrientValue}>
                      {nutritionalInfo.nutriments.fat_100g.toFixed(1)}g
                    </Text>
                  </View>
                </View>
              )}

              {nutritionalInfo.nutriments.fiber_100g !== undefined && (
                <View style={styles.nutrientRow}>
                  <View style={styles.nutrientIcon}>
                    <Apple size={24} color="#8B5CF6" />
                  </View>
                  <View style={styles.nutrientInfo}>
                    <Text style={styles.nutrientLabel}>Fiber</Text>
                    <Text style={styles.nutrientValue}>
                      {nutritionalInfo.nutriments.fiber_100g.toFixed(1)}g
                    </Text>
                  </View>
                </View>
              )}

              {nutritionalInfo.nutriments.sodium_100g !== undefined && (
                <View style={styles.nutrientRow}>
                  <View style={styles.nutrientIcon}>
                    <Droplet size={24} color="#6B7280" />
                  </View>
                  <View style={styles.nutrientInfo}>
                    <Text style={styles.nutrientLabel}>Sodium</Text>
                    <Text style={styles.nutrientValue}>
                      {(nutritionalInfo.nutriments.sodium_100g * 1000).toFixed(0)}mg
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.scanAnotherButton} onPress={resetScanner}>
            <Scan size={20} color={Colors.text} />
            <Text style={styles.scanAnotherButtonText}>Scan Another Product</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  closeIconButton: {
    position: 'absolute' as const,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scannerGuide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  scannerFrame: {
    width: 280,
    height: 200,
    position: 'relative' as const,
    marginBottom: 40,
  },
  corner: {
    position: 'absolute' as const,
    width: 40,
    height: 40,
    borderColor: Colors.accent,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  instructionsContainer: {
    alignItems: 'center',
  },
  instructionsTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 16,
    fontWeight: '600' as const,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  productHeader: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  productName: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    textAlign: 'center',
    marginTop: 16,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.accent,
    textAlign: 'center',
    marginTop: 8,
  },
  nutritionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  servingSize: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  nutrientsList: {
    gap: 16,
  },
  nutrientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  nutrientIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutrientInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nutrientLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  nutrientValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.accent,
  },
  scanAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  scanAnotherButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  doneButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  permissionMessage: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
});
