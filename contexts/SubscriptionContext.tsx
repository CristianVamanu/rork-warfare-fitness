import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────────
// RevenueCat product IDs — set these once you create products in App Store
// Connect / Google Play Console and RevenueCat dashboard.
// iOS:     Settings → Subscriptions in App Store Connect
// Android: Google Play Console → Monetize → Subscriptions
// ─────────────────────────────────────────────────────────────────────────────
export const RC_MONTHLY_ID = 'warfare_premium_monthly';   // e.g. $9.99/mo
export const RC_ANNUAL_ID  = 'warfare_premium_annual';    // e.g. $59.99/yr
export const RC_ENTITLEMENT = 'premium';

const STORAGE_KEY = 'wf_subscription_status';

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
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

const DEFAULT_STATE: SubscriptionState = {
  tier: 'free',
  isPremium: false,
  isActive: false,
  expirationDate: null,
  willRenew: false,
  productIdentifier: null,
  isInTrialPeriod: false,
  trialEndDate: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
};

export const [SubscriptionProvider, useSubscription] = createContextHook(() => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>(DEFAULT_STATE);

  const persist = useCallback(async (state: SubscriptionState) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, []);

  const refreshSubscriptionStatus = useCallback(async () => {
    try {
      // On native: use RevenueCat SDK (react-native-purchases)
      // Import is dynamic to avoid web build errors since the native module
      // isn't available on web. On web, fall back to Stripe-stored state.
      if (Platform.OS !== 'web') {
        try {
          const Purchases = require('react-native-purchases').default;
          const customerInfo = await Purchases.getCustomerInfo();
          const entitlement = customerInfo.entitlements.active[RC_ENTITLEMENT];
          if (entitlement) {
            const newState: SubscriptionState = {
              tier: 'premium',
              isPremium: true,
              isActive: true,
              expirationDate: entitlement.expirationDate,
              willRenew: entitlement.willRenew,
              productIdentifier: entitlement.productIdentifier,
              isInTrialPeriod: entitlement.periodType === 'TRIAL',
              trialEndDate: entitlement.periodType === 'TRIAL' ? entitlement.expirationDate : null,
              stripeCustomerId: subscriptionState.stripeCustomerId,
              stripeSubscriptionId: null,
            };
            setSubscriptionState(newState);
            await persist(newState);
            return;
          }
        } catch {
          // RevenueCat not configured yet — fall through to cached state
        }
      }

      // Web / fallback: use locally cached Stripe subscription state
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed: SubscriptionState = JSON.parse(cached);
        if (parsed.expirationDate && Date.now() > new Date(parsed.expirationDate).getTime()) {
          const expired = { ...DEFAULT_STATE, stripeCustomerId: parsed.stripeCustomerId };
          setSubscriptionState(expired);
          await persist(expired);
        } else {
          setSubscriptionState(parsed);
        }
      }
    } catch (e) {
      console.error('[Subscription] refresh error:', e);
    }
  }, [subscriptionState.stripeCustomerId, persist]);

  useEffect(() => {
    const init = async () => {
      // Configure RevenueCat on native only
      if (Platform.OS !== 'web') {
        try {
          const Purchases = require('react-native-purchases').default;
          const key = Platform.OS === 'ios'
            ? process.env.EXPO_PUBLIC_RC_IOS_KEY ?? ''
            : process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '';
          if (key) await Purchases.configure({ apiKey: key });
        } catch {
          // SDK not installed — will be added via EAS build
        }
      }
      await refreshSubscriptionStatus();
      setIsInitialized(true);
      setIsLoading(false);
    };
    void init();
  }, []);

  // Called after Stripe webhook confirms payment on web
  const updateSubscriptionFromStripe = useCallback(async (data: {
    isPremium: boolean;
    expirationDate: string | null;
    willRenew: boolean;
    productIdentifier: string;
    isInTrialPeriod: boolean;
    trialEndDate: string | null;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }) => {
    const newState: SubscriptionState = {
      tier: data.isPremium ? 'premium' : 'free',
      isPremium: data.isPremium,
      isActive: data.isPremium,
      expirationDate: data.expirationDate,
      willRenew: data.willRenew,
      productIdentifier: data.productIdentifier,
      isInTrialPeriod: data.isInTrialPeriod,
      trialEndDate: data.trialEndDate,
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
    };
    setSubscriptionState(newState);
    await persist(newState);
  }, [persist]);

  // Called when the user taps Subscribe on native
  const purchaseNative = useCallback(async (productId: string): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const Purchases = require('react-native-purchases').default;
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find(
        (p: any) => p.product.identifier === productId
      );
      if (!pkg) return false;
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const entitlement = customerInfo.entitlements.active[RC_ENTITLEMENT];
      if (entitlement) {
        await refreshSubscriptionStatus();
        return true;
      }
      return false;
    } catch (e: any) {
      if (!e.userCancelled) console.error('[Subscription] purchase error:', e);
      return false;
    }
  }, [refreshSubscriptionStatus]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const Purchases = require('react-native-purchases').default;
      const customerInfo = await Purchases.restorePurchases();
      const entitlement = customerInfo.entitlements.active[RC_ENTITLEMENT];
      if (entitlement) { await refreshSubscriptionStatus(); return true; }
      return false;
    } catch { return false; }
  }, [refreshSubscriptionStatus]);

  const setUserId = useCallback(async (userId: string) => {
    if (Platform.OS === 'web') return;
    try {
      const Purchases = require('react-native-purchases').default;
      await Purchases.logIn(userId);
    } catch {}
  }, []);

  const logout = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const Purchases = require('react-native-purchases').default;
        await Purchases.logOut();
      }
    } catch {}
    setSubscriptionState(DEFAULT_STATE);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const checkEntitlement = useCallback((id: string) =>
    id === 'premium' ? subscriptionState.isPremium : false
  , [subscriptionState.isPremium]);

  const canAccessContent = useCallback((dayNumber: number) =>
    subscriptionState.isPremium || dayNumber <= 7
  , [subscriptionState.isPremium]);

  const getDaysRemainingInTrial = useCallback((): number | null => {
    if (!subscriptionState.isInTrialPeriod || !subscriptionState.trialEndDate) return null;
    const diff = new Date(subscriptionState.trialEndDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  }, [subscriptionState.isInTrialPeriod, subscriptionState.trialEndDate]);

  return useMemo(() => ({
    isInitialized,
    isLoading,
    subscriptionState,
    refreshSubscriptionStatus,
    updateSubscriptionFromStripe,
    purchaseNative,
    restorePurchases,
    setUserId,
    logout,
    checkEntitlement,
    canAccessContent,
    getDaysRemainingInTrial,
  }), [
    isInitialized, isLoading, subscriptionState, refreshSubscriptionStatus,
    updateSubscriptionFromStripe, purchaseNative, restorePurchases,
    setUserId, logout, checkEntitlement, canAccessContent, getDaysRemainingInTrial,
  ]);
});

export type SubscriptionContextType = ReturnType<typeof useSubscription>;
