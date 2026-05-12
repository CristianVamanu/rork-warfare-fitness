import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ShopProduct {
  id: string;
  title: string;
  description: string;
  photoUrl: string;
  affiliateLink: string;
  price?: string;
  category?: string;
  order: number;
  createdAt: string;
  isActive: boolean;
}

const STORAGE_KEYS = {
  PRODUCTS: 'warfare_shop_products',
  COFFEE_LINK: 'warfare_coffee_link',
};

export const [ShopProvider, useShop] = createContextHook(() => {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [coffeeLink, setCoffeeLink] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[ShopContext] Loading shop data...');
        
        const storedProducts = await AsyncStorage.getItem(STORAGE_KEYS.PRODUCTS);
        if (storedProducts) {
          try {
            setProducts(JSON.parse(storedProducts));
            console.log('[ShopContext] Products loaded');
          } catch (err) {
            console.error('[ShopContext] Failed to parse products:', err);
          }
        }

        const storedCoffeeLink = await AsyncStorage.getItem(STORAGE_KEYS.COFFEE_LINK);
        if (storedCoffeeLink) {
          setCoffeeLink(storedCoffeeLink);
          console.log('[ShopContext] Coffee link loaded');
        }

        console.log('[ShopContext] Shop data loaded successfully');
      } catch (error) {
        console.error('[ShopContext] Error loading shop data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    void loadData();
  }, []);

  const createProduct = useCallback((productData: Omit<ShopProduct, 'id' | 'createdAt'>) => {
    const newProduct: ShopProduct = {
      ...productData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    const updated = [...products, newProduct];
    setProducts(updated);
    void AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
    console.log('[Shop] Created product:', newProduct.title);
    return newProduct;
  }, [products]);

  const updateProduct = useCallback((productId: string, updates: Partial<ShopProduct>) => {
    const updated = products.map(p => p.id === productId ? { ...p, ...updates } : p);
    setProducts(updated);
    void AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
    console.log('[Shop] Updated product:', productId);
  }, [products]);

  const deleteProduct = useCallback((productId: string) => {
    const updated = products.filter(p => p.id !== productId);
    setProducts(updated);
    void AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
    console.log('[Shop] Deleted product:', productId);
  }, [products]);

  const getActiveProducts = useCallback(() => {
    return products.filter(p => p.isActive).sort((a, b) => a.order - b.order);
  }, [products]);

  const updateCoffeeLink = useCallback((link: string) => {
    setCoffeeLink(link);
    void AsyncStorage.setItem(STORAGE_KEYS.COFFEE_LINK, link);
    console.log('[Shop] Updated coffee link');
  }, []);

  return useMemo(
    () => ({
      products,
      coffeeLink,
      isLoading,
      createProduct,
      updateProduct,
      deleteProduct,
      getActiveProducts,
      updateCoffeeLink,
    }),
    [
      products,
      coffeeLink,
      isLoading,
      createProduct,
      updateProduct,
      deleteProduct,
      getActiveProducts,
      updateCoffeeLink,
    ]
  );
});

export type ShopContextType = ReturnType<typeof useShop>;
