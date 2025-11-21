import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { ShoppingBag, ExternalLink } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { useShop } from '@/contexts/ShopContext';

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const { getActiveProducts } = useShop();
  
  const products = getActiveProducts();

  const handleOpenLink = async (url: string, title: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', `Cannot open this link: ${url}`);
      }
    } catch (error) {
      Alert.alert('Error', `Failed to open link for ${title}`);
      console.error('[Shop] Failed to open link:', error);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Shop',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ShoppingBag size={32} color={Colors.accent} />
          <Text style={styles.headerTitle}>Featured Products</Text>
          <Text style={styles.headerSubtitle}>Recommended products to support your fitness journey</Text>
        </View>

        {products.length === 0 ? (
          <View style={styles.emptyState}>
            <ShoppingBag size={64} color={Colors.textTertiary} />
            <Text style={styles.emptyStateTitle}>No Products Available</Text>
            <Text style={styles.emptyStateText}>Check back later for recommended products and deals</Text>
          </View>
        ) : (
          <View style={styles.productsList}>
            {products.map((product) => (
              <View key={product.id} style={styles.productCard}>
                {product.photoUrl && product.photoUrl.trim() !== '' ? (
                  <Image source={{ uri: product.photoUrl }} style={styles.productImage} />
                ) : (
                  <View style={[styles.productImage, styles.productImagePlaceholder]}>
                    <ShoppingBag size={48} color={Colors.textTertiary} />
                  </View>
                )}
                <View style={styles.productContent}>
                  <Text style={styles.productTitle}>{product.title}</Text>
                  <Text style={styles.productDescription}>{product.description}</Text>
                  {product.price && <Text style={styles.productPrice}>{product.price}</Text>}
                  {product.category && (
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{product.category}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={() => handleOpenLink(product.affiliateLink, product.title)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.viewButtonText}>View Product</Text>
                    <ExternalLink size={18} color={Colors.background} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  productsList: {
    padding: 20,
    gap: 20,
  },
  productCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  productImage: {
    width: '100%',
    height: 200,
  },
  productImagePlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productContent: {
    padding: 16,
  },
  productTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 10,
  },
  productDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  productPrice: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.accent,
    marginBottom: 12,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
  },
  viewButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.background,
  },
});
