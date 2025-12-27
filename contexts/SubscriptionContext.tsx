import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Platform, Alert } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const STORAGE_KEYS = {
  SUBSCRIPTION_STATUS: 'wf_subscription_status',
  ENTITLEMENTS: 'wf_entitlements',
};

export type SubscriptionTier = 'free' | 'premium';

export interface SubscriptionState {
  tier: SubscriptionTier;
  isPremium: boolean;
  isActive: boolean;
  expirationDate: string | null;
  willRenew: boolean;
  productIdentifier: string | null;
  isInTrialPeriod: boolean;
  trialEndDate: string | null;
}

const appOwnership = Constants.appOwnership ?? 'standalone';
const isExpoGo = appOwnership === 'expo';

export const [SubscriptionProvider, useSubscription] = createContextHook(() => {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>({
    tier: 'free',
    isPremium: false,
    isActive: false,
    expirationDate: null,
    willRenew: false,
    productIdentifier: null,
    isInTrialPeriod: false,
    trialEndDate: null,
  });
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);

  const refreshSubscriptionStatus = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'web' || isExpoGo) {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.SUBSCRIPTION_STATUS);
      if (cached) {
        setSubscriptionState(JSON.parse(cached));
      }
      return;
    }

    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);

      const entitlements = info.entitlements.active;
      const premiumEntitlement = entitlements['premium'];
      
      const isPremium = premiumEntitlement !== undefined;
      const isInTrialPeriod = (premiumEntitlement?.periodType === 'trial') || false;
      
      const trialEndDate = isInTrialPeriod && premiumEntitlement?.expirationDate
        ? premiumEntitlement.expirationDate
        : null;
      
      const newState: SubscriptionState = {
        tier: isPremium ? 'premium' : 'free',
        isPremium,
        isActive: isPremium,
        expirationDate: premiumEntitlement?.expirationDate ?? null,
        willRenew: premiumEntitlement?.willRenew ?? false,
        productIdentifier: premiumEntitlement?.productIdentifier ?? null,
        isInTrialPeriod,
        trialEndDate,
      };

      setSubscriptionState(newState);
      await AsyncStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_STATUS, JSON.stringify(newState));
      
      console.log('[Subscription] Status refreshed:', newState);
    } catch (error) {
      console.error('[Subscription] Failed to refresh status:', error);
    }
  }, []);

  const loadOfferings = useCallback(async () => {
    if (Platform.OS === 'web' || isExpoGo) {
      return;
    }

    try {
      const offerings = await Purchases.getOfferings();
      
      if (offerings.current) {
        setCurrentOffering(offerings.current);
        console.log('[Subscription] Offerings loaded:', offerings.current.availablePackages.length);
      } else {
        console.log('[Subscription] No offerings available');
      }
    } catch (error) {
      console.error('[Subscription] Failed to load offerings:', error);
    }
  }, []);

  useEffect(() => {
    let listener: ((info: CustomerInfo) => void) | null = null;

    const initializeRevenueCat = async () => {
      if (Platform.OS === 'web' || isExpoGo) {
        console.log('[Subscription] RevenueCat not supported on web or Expo Go');
        setIsInitialized(false);
        setIsLoading(false);
        return;
      }

      try {
        const universalKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
        const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
        const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

        const apiKey = universalKey ?? (Platform.OS === 'ios' ? iosKey : androidKey);

        if (!apiKey) {
          console.error('[Subscription] RevenueCat API key not found. Set EXPO_PUBLIC_REVENUECAT_API_KEY (preferred) or platform keys.');
          setIsInitialized(false);
          setIsLoading(false);
          return;
        }

        Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        console.log('[Subscription] Configuring RevenueCat...', {
          platform: Platform.OS,
          hasUniversalKey: Boolean(universalKey),
          hasIosKey: Boolean(iosKey),
          hasAndroidKey: Boolean(androidKey),
        });

        try {
          await Purchases.configure({ apiKey });
        } catch (configError: any) {
          console.warn('[Subscription] RevenueCat configuration failed (expected in sandbox/dev):', configError.message);
          console.log('[Subscription] Granting free access - RevenueCat not available in this environment');
          setIsInitialized(false);
          setIsLoading(false);
          setSubscriptionState({
            tier: 'premium',
            isPremium: true,
            isActive: true,
            expirationDate: null,
            willRenew: false,
            productIdentifier: 'sandbox_free_access',
            isInTrialPeriod: false,
            trialEndDate: null,
          });
          return;
        }

        listener = (info: CustomerInfo) => {
          console.log('[Subscription] CustomerInfo updated via listener');
          setCustomerInfo(info);
          void refreshSubscriptionStatus();
        };

        Purchases.addCustomerInfoUpdateListener(listener);

        console.log('[Subscription] RevenueCat initialized');
        setIsInitialized(true);

        await refreshSubscriptionStatus();
        await loadOfferings();
      } catch (error) {
        console.error('[Subscription] Initialization failed:', error);
        setIsInitialized(false);
      } finally {
        setIsLoading(false);
      }
    };

    void initializeRevenueCat();

    return () => {
      if (Platform.OS === 'web' || isExpoGo) return;
      try {
        if (listener) {
          Purchases.removeCustomerInfoUpdateListener(listener);
        }
      } catch (error) {
        console.log('[Subscription] Failed to remove listener (safe to ignore):', error);
      }
    };
  }, [refreshSubscriptionStatus, loadOfferings]);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    if (Platform.OS === 'web' || isExpoGo) {
      Alert.alert(
        'Not Available',
        'Subscriptions are not available in this environment. Please use a production build.'
      );
      return false;
    }

    try {
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(info);
      
      await refreshSubscriptionStatus();
      
      Alert.alert(
        'Success!',
        'Welcome to Premium! You now have access to all exclusive content.'
      );
      
      return true;
    } catch (error: any) {
      if (!error.userCancelled) {
        console.error('[Subscription] Purchase failed:', error);
        Alert.alert(
          'Purchase Failed',
          error.message || 'Unable to complete purchase. Please try again.'
        );
      }
      return false;
    }
  }, [refreshSubscriptionStatus]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web' || isExpoGo) {
      Alert.alert(
        'Not Available',
        'Restore purchases is not available in this environment.'
      );
      return false;
    }

    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      
      await refreshSubscriptionStatus();
      
      const hasPremium = info.entitlements.active['premium'] !== undefined;
      
      if (hasPremium) {
        Alert.alert('Success', 'Your purchases have been restored!');
        return true;
      } else {
        Alert.alert('No Purchases Found', 'No previous purchases were found for this account.');
        return false;
      }
    } catch (error) {
      console.error('[Subscription] Restore failed:', error);
      Alert.alert('Error', 'Failed to restore purchases. Please try again.');
      return false;
    }
  }, [refreshSubscriptionStatus]);

  const setUserId = useCallback(async (userId: string) => {
    if (Platform.OS === 'web' || isExpoGo || !isInitialized) {
      console.log('[Subscription] Skipping user ID sync (web, Expo Go, or not initialized)');
      return;
    }

    try {
      const { customerInfo } = await Purchases.logIn(userId);
      console.log('[Subscription] User ID synced with RevenueCat:', userId);
      setCustomerInfo(customerInfo);
      await refreshSubscriptionStatus();
    } catch (error) {
      console.error('[Subscription] Failed to set user ID:', error);
    }
  }, [refreshSubscriptionStatus, isInitialized]);

  const logout = useCallback(async () => {
    if (Platform.OS === 'web' || isExpoGo) {
      return;
    }

    try {
      await Purchases.logOut();
      console.log('[Subscription] User logged out');
      
      setSubscriptionState({
        tier: 'free',
        isPremium: false,
        isActive: false,
        expirationDate: null,
        willRenew: false,
        productIdentifier: null,
        isInTrialPeriod: false,
        trialEndDate: null,
      });
      
      await AsyncStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION_STATUS);
    } catch (error) {
      console.error('[Subscription] Logout failed:', error);
    }
  }, []);

  const checkEntitlement = useCallback((entitlementId: string): boolean => {
    if (entitlementId === 'premium') {
      return subscriptionState.isPremium;
    }
    return false;
  }, [subscriptionState.isPremium]);

  const canAccessContent = useCallback((dayNumber: number): boolean => {
    if (subscriptionState.isPremium) {
      return true;
    }
    return dayNumber <= 7;
  }, [subscriptionState.isPremium]);

  const getDaysRemainingInTrial = useCallback((): number | null => {
    if (!subscriptionState.isInTrialPeriod || !subscriptionState.trialEndDate) {
      return null;
    }
    
    const now = new Date();
    const trialEnd = new Date(subscriptionState.trialEndDate);
    const diffMs = trialEnd.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }, [subscriptionState.isInTrialPeriod, subscriptionState.trialEndDate]);

  return useMemo(
    () => ({
      isInitialized,
      isLoading,
      subscriptionState,
      currentOffering,
      customerInfo,
      purchasePackage,
      restorePurchases,
      refreshSubscriptionStatus,
      setUserId,
      logout,
      checkEntitlement,
      canAccessContent,
      getDaysRemainingInTrial,
    }),
    [
      isInitialized,
      isLoading,
      subscriptionState,
      currentOffering,
      customerInfo,
      purchasePackage,
      restorePurchases,
      refreshSubscriptionStatus,
      setUserId,
      logout,
      checkEntitlement,
      canAccessContent,
      getDaysRemainingInTrial,
    ]
  );
});

export type SubscriptionContextType = ReturnType<typeof useSubscription>;
