import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Switch,
} from 'react-native';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ShoppingBag, Plus, Trash2, Upload, Image as ImageIcon, ExternalLink, Edit2 } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useShop, ShopProduct } from '@/contexts/ShopContext';

export default function AdminShopScreen() {
  const { products, createProduct, updateProduct, deleteProduct } = useShop();
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Omit<ShopProduct, 'id' | 'createdAt'>>({
    title: '',
    description: '',
    photoUrl: '',
    affiliateLink: '',
    price: '',
    category: '',
    order: products.length,
    isActive: true,
  });

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload a product image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setFormData({ ...formData, photoUrl: result.assets[0].uri });
      console.log('[AdminShop] Product image selected:', result.assets[0].uri);
    }
  };

  const handleSaveProduct = () => {
    if (!formData.title.trim()) {
      Alert.alert('Validation Error', 'Product title is required');
      return;
    }
    if (!formData.description.trim()) {
      Alert.alert('Validation Error', 'Product description is required');
      return;
    }
    if (!formData.photoUrl.trim()) {
      Alert.alert('Validation Error', 'Product photo is required');
      return;
    }
    if (!formData.affiliateLink.trim()) {
      Alert.alert('Validation Error', 'Affiliate link is required');
      return;
    }

    if (editingId) {
      updateProduct(editingId, formData);
      Alert.alert('Success', 'Product updated successfully');
      setEditingId(null);
    } else {
      createProduct(formData);
      Alert.alert('Success', 'Product created successfully');
      setIsAdding(false);
    }

    setFormData({
      title: '',
      description: '',
      photoUrl: '',
      affiliateLink: '',
      price: '',
      category: '',
      order: products.length,
      isActive: true,
    });
  };

  const handleEditProduct = (product: ShopProduct) => {
    setFormData({
      title: product.title,
      description: product.description,
      photoUrl: product.photoUrl,
      affiliateLink: product.affiliateLink,
      price: product.price ?? '',
      category: product.category ?? '',
      order: product.order,
      isActive: product.isActive,
    });
    setEditingId(product.id);
    setIsAdding(true);
  };

  const handleDeleteProduct = (productId: string, title: string) => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteProduct(productId);
            Alert.alert('Success', 'Product deleted successfully');
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({
      title: '',
      description: '',
      photoUrl: '',
      affiliateLink: '',
      price: '',
      category: '',
      order: products.length,
      isActive: true,
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Manage Shop',
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
        }}
      />

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ShoppingBag size={32} color={Colors.accent} />
          <Text style={styles.headerTitle}>Shop Management</Text>
          <Text style={styles.headerSubtitle}>Manage affiliate products and promotions</Text>
        </View>

        {!isAdding && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setIsAdding(true)}
              activeOpacity={0.7}
            >
              <Plus size={20} color={Colors.background} />
              <Text style={styles.addButtonText}>Add New Product</Text>
            </TouchableOpacity>
          </View>
        )}

        {isAdding && (
          <View style={styles.section}>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{editingId ? 'Edit Product' : 'Add New Product'}</Text>

              <Text style={styles.label}>Product Title *</Text>
              <TextInput
                style={styles.input}
                value={formData.title}
                onChangeText={(text) => setFormData({ ...formData, title: text })}
                placeholder="e.g., Premium Protein Powder"
                placeholderTextColor={Colors.textTertiary}
              />

              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Describe the product and its benefits..."
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={4}
              />

              <Text style={styles.label}>Product Image *</Text>
              {formData.photoUrl ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: formData.photoUrl }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.changeImageBtn} onPress={handlePickImage}>
                    <Upload size={16} color={Colors.accent} />
                    <Text style={styles.changeImageText}>Change Image</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.imageUploadBox} onPress={handlePickImage}>
                  <ImageIcon size={48} color={Colors.textTertiary} />
                  <Text style={styles.imageUploadText}>Tap to upload product image</Text>
                  <Text style={styles.imageUploadSubtext}>Recommended: 1200x900 or 4:3 ratio</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.label}>Affiliate Link *</Text>
              <TextInput
                style={styles.input}
                value={formData.affiliateLink}
                onChangeText={(text) => setFormData({ ...formData, affiliateLink: text })}
                placeholder="https://example.com/product?ref=yourcode"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Price (Optional)</Text>
              <TextInput
                style={styles.input}
                value={formData.price}
                onChangeText={(text) => setFormData({ ...formData, price: text })}
                placeholder="$49.99"
                placeholderTextColor={Colors.textTertiary}
              />

              <Text style={styles.label}>Category (Optional)</Text>
              <TextInput
                style={styles.input}
                value={formData.category}
                onChangeText={(text) => setFormData({ ...formData, category: text })}
                placeholder="e.g., Supplements, Equipment, Apparel"
                placeholderTextColor={Colors.textTertiary}
              />

              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.switchLabel}>Product Active</Text>
                  <Text style={styles.switchDescription}>Show this product in the shop</Text>
                </View>
                <Switch
                  value={formData.isActive}
                  onValueChange={(value) => setFormData({ ...formData, isActive: value })}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                />
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveProduct}>
                  <Text style={styles.saveButtonText}>{editingId ? 'Update' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Products ({products.length})</Text>
          {products.length === 0 ? (
            <View style={styles.emptyState}>
              <ShoppingBag size={64} color={Colors.textTertiary} />
              <Text style={styles.emptyStateTitle}>No Products Yet</Text>
              <Text style={styles.emptyStateText}>Add your first affiliate product to get started</Text>
            </View>
          ) : (
            <View style={styles.productsList}>
              {products.map((product) => (
                <View key={product.id} style={styles.productCard}>
                  <Image source={{ uri: product.photoUrl }} style={styles.productImage} />
                  <View style={styles.productContent}>
                    <View style={styles.productHeader}>
                      <Text style={styles.productTitle}>{product.title}</Text>
                      {!product.isActive && (
                        <View style={styles.inactiveBadge}>
                          <Text style={styles.inactiveBadgeText}>Inactive</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.productDescription} numberOfLines={2}>{product.description}</Text>
                    {product.price && <Text style={styles.productPrice}>{product.price}</Text>}
                    {product.category && (
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>{product.category}</Text>
                      </View>
                    )}
                    <View style={styles.productActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleEditProduct(product)}
                      >
                        <Edit2 size={16} color={Colors.accent} />
                        <Text style={styles.actionButtonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDeleteProduct(product.id, product.title)}
                      >
                        <Trash2 size={16} color={Colors.danger} />
                        <Text style={[styles.actionButtonText, { color: Colors.danger }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
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
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 16,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  imageUploadBox: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    borderStyle: 'dashed' as const,
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  imageUploadText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 12,
  },
  imageUploadSubtext: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  imagePreviewContainer: {
    marginBottom: 16,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  changeImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  changeImageText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 20,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  switchDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: Colors.accent,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.background,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
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
    gap: 16,
  },
  productCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 180,
  },
  productContent: {
    padding: 16,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  productTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
  },
  inactiveBadge: {
    backgroundColor: Colors.textTertiary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.background,
    textTransform: 'uppercase' as const,
  },
  productDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  productPrice: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.accent,
    marginBottom: 12,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  productActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceLight,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
});
