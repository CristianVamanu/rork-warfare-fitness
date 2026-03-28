import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  SUBSCRIPTION_STATUS: 'wf_subscription_status',
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
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

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
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });

  const refreshSubscriptionStatus = useCallback(async (): Promise<void> => {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.SUBSCRIPTION_STATUS);
      if (cached) {
        const parsedState = JSON.parse(cached);
        setSubscriptionState(parsedState);

        if (parsedState.expirationDate) {
          const expirationTime = new Date(parsedState.expirationDate).getTime();
          const now = Date.now();

          if (now > expirationTime) {
            const expiredState: SubscriptionState = {
              tier: 'free',
              isPremium: false,
              isActive: false,
              expirationDate: null,
              willRenew: false,
              productIdentifier: null,
              isInTrialPeriod: false,
              trialEndDate: null,
              stripeCustomerId: parsedState.stripeCustomerId,
              stripeSubscriptionId: null,
            };
            setSubscriptionState(expiredState);
            await AsyncStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_STATUS, JSON.stringify(expiredState));
          }
        }
      }
    } catch (error) {
      console.error('[Subscription] Failed to refresh status:', error);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        await refreshSubscriptionStatus();
        setIsInitialized(true);
      } catch (error) {
        console.error('[Subscription] Initialization failed:', error);
        setIsInitialized(false);
      } finally {
        setIsLoading(false);
      }
    };

    void initialize();
  }, [refreshSubscriptionStatus]);

  const updateSubscriptionFromStripe = useCallback(async (subscriptionData: {
    isPremium: boolean;
    expirationDate: string | null;
    willRenew: boolean;
    productIdentifier: string;
    isInTrialPeriod: boolean;
    trialEndDate: string | null;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }): Promise<void> => {
    const newState: SubscriptionState = {
      tier: subscriptionData.isPremium ? 'premium' : 'free',
      isPremium: subscriptionData.isPremium,
      isActive: subscriptionData.isPremium,
      expirationDate: subscriptionData.expirationDate,
      willRenew: subscriptionData.willRenew,
      productIdentifier: subscriptionData.productIdentifier,
      isInTrialPeriod: subscriptionData.isInTrialPeriod,
      trialEndDate: subscriptionData.trialEndDate,
      stripeCustomerId: subscriptionData.stripeCustomerId,
      stripeSubscriptionId: subscriptionData.stripeSubscriptionId,
    };

    setSubscriptionState(newState);
    await AsyncStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_STATUS, JSON.stringify(newState));
    console.log('[Subscription] Updated from Stripe:', newState);
  }, []);

  const setUserId = useCallback(async (userId: string) => {
    console.log('[Subscription] User ID set:', userId);
  }, []);

  const logout = useCallback(async () => {
    try {
      setSubscriptionState({
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
      });

      await AsyncStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION_STATUS);
      console.log('[Subscription] User logged out');
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
      refreshSubscriptionStatus,
      updateSubscriptionFromStripe,
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
      refreshSubscriptionStatus,
      updateSubscriptionFromStripe,
      setUserId,
      logout,
      checkEntitlement,
      canAccessContent,
      getDaysRemainingInTrial,
    ]
  );
});

export type SubscriptionContextType = ReturnType<typeof useSubscription>;
