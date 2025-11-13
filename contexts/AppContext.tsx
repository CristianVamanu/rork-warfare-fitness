import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, Platform } from 'react-native';
import { useStripe, PaymentSheetError } from '@stripe/stripe-react-native';
import { trpcClient } from '@/lib/trpc';

import { MISSIONS, Mission } from '@/constants/missions';
import { ADMIN_AVATAR, DEFAULT_AVATAR } from '@/constants/avatars';

type SubscriptionTier = 'free' | 'premium';

interface PowerLevelMetrics {
  loginStreak: number;
  lastLoginDate: string;
  lastStreakMilestone: number;
  totalWorkoutsCompleted: number;
  totalSpent: number;
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface MealEntry {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: MealType;
  imageUri?: string;
  loggedAt: string;
}

interface FastingState {
  userId: string;
  isActive: boolean;
  startTime: string;
  durationHours: number;
}

interface IceBathLog {
  id: string;
  durationMin: number;
  loggedAt: string;
}

interface DailyBriefing {
  id: string;
  text: string;
  author: string;
  repeatDays?: number;
  lastShownDate?: string;
  order: number;
}

interface FreePackageFeatures {
  trainingPrograms: boolean;
  freeTrialDays: number;
  community: boolean;
  leaderboard: boolean;
  profile: boolean;
  nutrition: boolean;
  hydration: boolean;
  missions: boolean;
  iceBath: boolean;
}

interface AdminAppSettings {
  enableNotifications: boolean;
  requireVerification: boolean;
  subscriptionPrices: { premium: string; freeTrialDays: number };
  freePackage: FreePackageFeatures;
  appName: string;
  tagline: string;
  supportEmail: string;
  payments: { stripePublicKey?: string; stripeSecretKey?: string; paypalClientId?: string; activeProvider?: 'stripe' | 'paypal' };
  welcomeMessage?: string;
  welcomeVideoUrl?: string;
  dailyMessage?: string;
  aiApiKey?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  dailyBriefings?: DailyBriefing[];
  appLogo?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  avatar?: string;
  weightUnit?: 'lbs' | 'kg';
  registrationDate?: string;
  height?: string;
  weight?: string;
  age?: string;
  goal?: string;
  referralCode?: string;
  referredBy?: string;
  totalReferrals?: number;
  subscriptionTier?: SubscriptionTier;
  premiumExpiresAt?: string;
  powerLevelSnapshot?: number;
}

const ADMIN_EMAILS = ['admin@warfarefitness.com', 'superadmin@warfarefitness.com'];

const ADMIN_CREDENTIALS: Record<string, string> = {
  'admin@warfarefitness.com': 'M@ngalia88',
  'superadmin@warfarefitness.com': 'M@ngalia88',
};

const STORAGE_KEYS = {
  STREAK: 'warfare_streak',
  POWER_LEVEL: 'warfare_power_level',
  MISSIONS: 'warfare_missions',
  LAST_DATE: 'warfare_last_date',
  LAST_POST_DATE: 'warfare_last_post_date',
  LAST_LOGIN_DATE: 'warfare_last_login_date',
  HYDRATION: 'warfare_hydration',
  HYDRATION_TARGET: 'warfare_hydration_target',
  CALORIE_TARGET: 'warfare_calorie_target',
  MEALS: 'warfare_meals',
  TIER: 'warfare_subscription_tier',
  APP_SETTINGS: 'warfare_admin_app_settings',
  USER: 'warfare_user',

  POWER_METRICS: 'warfare_power_metrics',
  FASTING_STATE: 'warfare_fasting_state',
  ICE_BATHS: 'warfare_ice_baths',
  ALL_USERS: 'warfare_all_users',
  REFERRALS: 'warfare_referrals',
};

export const [AppProvider, useApp] = createContextHook(() => {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [streak, setStreak] = useState<number>(0);
  const [powerLevel, setPowerLevel] = useState<number>(0);
  const [missions, setMissions] = useState<Mission[]>(MISSIONS);

  const [hydrationMl, setHydrationMl] = useState<number>(0);
  const [hydrationTargetMl, setHydrationTargetMl] = useState<number>(2500);

  const [calorieTarget, setCalorieTarget] = useState<number>(2400);
  const [meals, setMeals] = useState<MealEntry[]>([]);

  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('free');
  const [registrationDate, setRegistrationDate] = useState<string | undefined>(undefined);

  const [adminSettings, setAdminSettings] = useState<AdminAppSettings>({
    enableNotifications: true,
    requireVerification: false,
    subscriptionPrices: { premium: '49', freeTrialDays: 7 },
    freePackage: {
      trainingPrograms: true,
      freeTrialDays: 7,
      community: true,
      leaderboard: true,
      profile: true,
      nutrition: true,
      hydration: true,
      missions: true,
      iceBath: true,
    },
    appName: 'Warfare Fitness',
    tagline: 'Forge Strength. Crush Anxiety. Dominate Your Life.',
    supportEmail: 'support@warfarefitness.com',
    payments: { stripePublicKey: 'pk_live_51RSjA2AMFV2705RIx5mDNtwcI2nYm9Bo1AlXtzY4M3GEcUTxuMPrxMs2BVuQuA1hyVJk5m7ZDYjNJW9t6ObimI0g00K9RIHQEb', stripeSecretKey: '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', activeProvider: 'stripe' },
    welcomeMessage: 'Welcome to Warfare Fitness, Soldier!',
    welcomeVideoUrl: '',
    dailyMessage: 'Today is your day to dominate. No excuses.',
    aiApiKey: '',
    heroTitle: 'Your Mission Awaits, Soldier',
    heroSubtitle: 'Forge Strength. Crush Anxiety. Dominate Your Life.',
    dailyBriefings: [
      {
        id: 'default',
        text: '"Discipline is forged in fire. Today, you enter the warzone of self-mastery. Every rep is a battle. Every decision is a mission. Your enemy is weakness. Your weapon is action."',
        author: 'Commander',
        order: 0,
      },
    ],
    appLogo: '',
  });

  const [user, setUser] = useState<User | undefined>(undefined);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [powerMetrics, setPowerMetrics] = useState<PowerLevelMetrics>({
    loginStreak: 0,
    lastLoginDate: '',
    lastStreakMilestone: 0,
    totalWorkoutsCompleted: 0,
    totalSpent: 0,
  });
  const [fastingState, setFastingState] = useState<FastingState | undefined>(undefined);
  const [iceBaths, setIceBaths] = useState<IceBathLog[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[AppContext] Loading persisted data...');
        
        const storedUser = await AsyncStorage.getItem(STORAGE_KEYS.USER);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser) as User);
            console.log('[AppContext] User loaded from storage');
          } catch (err) {
            console.error('[AppContext] Failed to parse user data:', err);
          }
        }

        const storedStreak = await AsyncStorage.getItem(STORAGE_KEYS.STREAK);
        if (storedStreak) {
          const parsed = parseInt(storedStreak, 10);
          if (!isNaN(parsed)) setStreak(parsed);
        }

        const storedPower = await AsyncStorage.getItem(STORAGE_KEYS.POWER_LEVEL);
        if (storedPower) {
          const parsed = parseInt(storedPower, 10);
          if (!isNaN(parsed)) setPowerLevel(parsed);
        }

        const storedMissions = await AsyncStorage.getItem(STORAGE_KEYS.MISSIONS);
        if (storedMissions) {
          try {
            setMissions(JSON.parse(storedMissions));
          } catch {}
        }

        const storedHydration = await AsyncStorage.getItem(STORAGE_KEYS.HYDRATION);
        if (storedHydration) {
          const parsed = parseInt(storedHydration, 10);
          if (!isNaN(parsed)) setHydrationMl(parsed);
        }

        const storedHydrationTarget = await AsyncStorage.getItem(STORAGE_KEYS.HYDRATION_TARGET);
        if (storedHydrationTarget) {
          const parsed = parseInt(storedHydrationTarget, 10);
          if (!isNaN(parsed)) setHydrationTargetMl(parsed);
        }

        const storedCalorieTarget = await AsyncStorage.getItem(STORAGE_KEYS.CALORIE_TARGET);
        if (storedCalorieTarget) {
          const parsed = parseInt(storedCalorieTarget, 10);
          if (!isNaN(parsed)) setCalorieTarget(parsed);
        }

        const storedMeals = await AsyncStorage.getItem(STORAGE_KEYS.MEALS);
        if (storedMeals) {
          try {
            setMeals(JSON.parse(storedMeals));
          } catch {}
        }

        const storedTier = await AsyncStorage.getItem(STORAGE_KEYS.TIER);
        console.log('[AppContext] ===== LOADING SUBSCRIPTION TIER =====');
        console.log('[AppContext] Stored tier from AsyncStorage:', storedTier);
        if (storedTier) {
          setSubscriptionTier(storedTier as SubscriptionTier);
          console.log('[AppContext] ✅ Subscription tier set to:', storedTier);
        } else {
          console.log('[AppContext] ⚠️ No tier found in storage, using default: free');
        }
        console.log('[AppContext] ===== TIER LOADING COMPLETE =====');

        const storedRegDate = await AsyncStorage.getItem('warfare_registration_date');
        if (storedRegDate) {
          setRegistrationDate(storedRegDate);
          console.log('[AppContext] Registration date loaded:', storedRegDate);
        }

        const storedSettings = await AsyncStorage.getItem(STORAGE_KEYS.APP_SETTINGS);
        if (storedSettings) {
          try {
            setAdminSettings(JSON.parse(storedSettings));
          } catch {}
        }



        const storedMetrics = await AsyncStorage.getItem(STORAGE_KEYS.POWER_METRICS);
        if (storedMetrics) {
          try {
            setPowerMetrics(JSON.parse(storedMetrics));
          } catch {}
        }

        if (storedUser) {
          try {
            const currentUser = JSON.parse(storedUser) as User;
            const storedFasting = await AsyncStorage.getItem(STORAGE_KEYS.FASTING_STATE);
            if (storedFasting) {
              try {
                const fastingData = JSON.parse(storedFasting) as FastingState;
                if (fastingData.userId === currentUser.id) {
                  setFastingState(fastingData);
                  console.log('[AppContext] Fasting state loaded for user:', currentUser.id);
                } else {
                  console.log('[AppContext] Fasting state belongs to different user, clearing it');
                  await AsyncStorage.removeItem(STORAGE_KEYS.FASTING_STATE);
                }
              } catch {}
            }
          } catch {}
        }

        const storedIceBaths = await AsyncStorage.getItem(STORAGE_KEYS.ICE_BATHS);
        if (storedIceBaths) {
          try {
            setIceBaths(JSON.parse(storedIceBaths));
          } catch {}
        }

        console.log('[AppContext] All data loaded successfully');
      } catch (error) {
        console.error('[AppContext] Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    void loadData();
  }, []);

  const addPower = useCallback((amount: number) => {
    if (isNaN(amount) || !isFinite(amount)) {
      console.error('[Power] Invalid power amount:', amount);
      return;
    }
    const currentPower = isNaN(powerLevel) ? 0 : powerLevel;
    const next = currentPower + amount;
    if (isNaN(next) || !isFinite(next)) {
      console.error('[Power] Invalid power calculation:', { current: powerLevel, amount, next });
      return;
    }
    setPowerLevel(next);
    void AsyncStorage.setItem(STORAGE_KEYS.POWER_LEVEL, String(next));
  }, [powerLevel]);

  const incrementStreak = useCallback((amount: number = 1) => {
    const next = streak + amount;
    setStreak(next);
    void AsyncStorage.setItem(STORAGE_KEYS.STREAK, String(next));
  }, [streak]);

  const addWater = useCallback((amount: number) => {
    const next = hydrationMl + amount;
    setHydrationMl(next);
    void AsyncStorage.setItem(STORAGE_KEYS.HYDRATION, String(next));
    if (next >= hydrationTargetMl) {
      addPower(5);
    }
  }, [hydrationMl, hydrationTargetMl, addPower]);

  const resetHydration = useCallback(() => {
    setHydrationMl(0);
    void AsyncStorage.setItem(STORAGE_KEYS.HYDRATION, '0');
  }, []);

  const updateHydrationTarget = useCallback((ml: number) => {
    setHydrationTargetMl(ml);
    void AsyncStorage.setItem(STORAGE_KEYS.HYDRATION_TARGET, String(ml));
  }, []);

  const setDailyCalorieTarget = useCallback((cal: number) => {
    setCalorieTarget(cal);
    void AsyncStorage.setItem(STORAGE_KEYS.CALORIE_TARGET, String(cal));
  }, []);

  const addMeal = useCallback((entry: Omit<MealEntry, 'id' | 'loggedAt'>) => {
    const newEntry: MealEntry = { id: Date.now().toString(), loggedAt: new Date().toISOString(), ...entry };
    const next = [newEntry, ...meals];
    setMeals(next);
    void AsyncStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(next));
  }, [meals]);

  const setTier = useCallback(async (tier: SubscriptionTier) => {
    console.log('[Subscription] ===== SETTING TIER =====');
    console.log('[Subscription] New tier:', tier);
    console.log('[Subscription] Current user:', user?.email);
    console.log('[Subscription] Current subscriptionTier state:', subscriptionTier);
    
    setSubscriptionTier(tier);
    await AsyncStorage.setItem(STORAGE_KEYS.TIER, tier);
    console.log('[Subscription] ✅ Saved tier to AsyncStorage:', tier);
    
    if (user) {
      const updatedUser = { ...user, subscriptionTier: tier };
      setUser(updatedUser);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
      console.log('[Subscription] ✅ Updated user object with tier');
      
      const allUsersData = await AsyncStorage.getItem(STORAGE_KEYS.ALL_USERS);
      const allUsers = allUsersData ? JSON.parse(allUsersData) : [];
      const userIndex = allUsers.findIndex((u: User & { subscriptionTier?: SubscriptionTier }) => u.email === user.email);
      
      if (userIndex >= 0) {
        allUsers[userIndex] = { ...allUsers[userIndex], subscriptionTier: tier };
        console.log('[Subscription] ✅ Updated existing user in all users list');
      } else {
        allUsers.push({ ...updatedUser, subscriptionTier: tier });
        console.log('[Subscription] ✅ Added new user to all users list');
      }
      
      await AsyncStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(allUsers));
      console.log('[Subscription] ✅ TIER UPDATE COMPLETE - User:', user.email, 'Tier:', tier);
    } else {
      console.log('[Subscription] ⚠️ No user logged in, tier saved globally only');
    }
    
    console.log('[Subscription] ===== TIER SETTING COMPLETE =====');
  }, [user, subscriptionTier]);

  const updateAdminSettings = useCallback((updates: Partial<AdminAppSettings>) => {
    const next = { ...adminSettings, ...updates };
    setAdminSettings(next);
    void AsyncStorage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify(next));
  }, [adminSettings]);



  const beginCheckout = useCallback(async (targetTier: SubscriptionTier) => {
    if (targetTier === 'free') {
      setTier('free');
      return;
    }
    
    const keys = adminSettings.payments;
    const provider = keys.activeProvider ?? 'stripe';
    const hasStripe = !!keys.stripePublicKey && !!keys.stripeSecretKey;
    const hasPaypal = !!keys.paypalClientId;
    
    if (provider === 'stripe' && !hasStripe) {
      Alert.alert('Payments not configured', 'Stripe payment keys are not configured. Please configure them in Admin Settings.');
      return;
    }
    
    if (provider === 'paypal' && !hasPaypal) {
      Alert.alert('Payments not configured', 'PayPal payment keys are not configured.');
      return;
    }

    const tierPrice = parseFloat(adminSettings.subscriptionPrices.premium);
    if (isNaN(tierPrice) || tierPrice <= 0) {
      Alert.alert('Configuration Error', 'Invalid subscription price. Please check admin settings.');
      return;
    }
    
    if (provider === 'stripe') {
      console.log('[Payment] Starting Stripe payment for premium tier');
      console.log('[Payment] Amount:', tierPrice);
      
      try {
        console.log('[Payment] Creating payment intent...');
        const response = await trpcClient.payments.createPaymentIntent.mutate({
          amount: tierPrice,
          currency: 'usd',
          stripeSecretKey: keys.stripeSecretKey!,
          customerEmail: user?.email,
        });

        if (!response.paymentIntent) {
          throw new Error('Failed to create payment intent');
        }

        console.log('[Payment] Initializing payment sheet...');
        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: response.paymentIntent,
          merchantDisplayName: adminSettings.appName,
          applePay: {
            merchantCountryCode: 'US',
          },
          googlePay: {
            merchantCountryCode: 'US',
            testEnv: false,
          },
          allowsDelayedPaymentMethods: true,
          returnURL: Platform.select({
            ios: 'warfarefitness://stripe-redirect',
            android: 'warfarefitness://stripe-redirect',
            default: undefined,
          }),
        });

        if (initError) {
          console.error('[Payment] Payment sheet initialization error:', initError);
          Alert.alert('Payment Error', 'Failed to initialize payment. Please try again.');
          return;
        }

        console.log('[Payment] Presenting payment sheet...');
        const { error: presentError } = await presentPaymentSheet();

        if (presentError) {
          const paymentError = presentError as PaymentSheetError;
          if (paymentError.code === 'Canceled') {
            console.log('[Payment] Payment cancelled by user');
          } else {
            console.error('[Payment] Payment error:', paymentError);
            Alert.alert('Payment Failed', paymentError.message || 'Payment was not completed. Please try again.');
          }
          return;
        }

        console.log('[Payment] Payment successful!');
        await processPaymentSuccess('premium', tierPrice);
        
        Alert.alert(
          '🎉 Payment Successful!',
          'Your premium subscription has been activated. Enjoy unlimited access!',
          [{ text: 'Awesome!', style: 'default' }]
        );
      } catch (error) {
        console.error('[Payment] Stripe payment error:', error);
        Alert.alert('Payment Error', 'Failed to process payment. Please try again later.');
      }
    } else {
      const url = 'https://www.paypal.com/webapps/billing/plans/subscribe';
      console.log('[Payment] Opening PayPal checkout for premium tier');
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (!canOpen) {
          Alert.alert('Error', 'Cannot open payment link. Please check your internet connection.');
          return;
        }
        await Linking.openURL(url);
        Alert.alert(
          'Payment Processing',
          'Complete your payment on PayPal. Your subscription will activate automatically upon successful payment.',
          [{ text: 'OK' }]
        );
      } catch (e) {
        console.error('Payment error:', e);
        Alert.alert('Payment Error', 'Failed to open payment page. Please try again later.');
      }
    }
  }, [adminSettings.payments, adminSettings.subscriptionPrices, adminSettings.appName, setTier, initPaymentSheet, presentPaymentSheet, processPaymentSuccess, user]);

  const getTodayMeals = useCallback(() => {
    const todayStr = new Date().toDateString();
    return meals.filter(m => new Date(m.loggedAt).toDateString() === todayStr);
  }, [meals]);



  const login = useCallback(async (email: string, name?: string, password?: string, isNewUser: boolean = false, username?: string, weightUnit?: 'lbs' | 'kg', height?: string, weight?: string, age?: string, goal?: string, referredBy?: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    const isAdminEmail = ADMIN_EMAILS.includes(normalizedEmail);
    
    if (isAdminEmail) {
      const correctPassword = ADMIN_CREDENTIALS[normalizedEmail];
      if (!password) {
        throw new Error('Password required for admin login');
      }
      if (password !== correctPassword) {
        throw new Error('Invalid password');
      }
    }
    
    const allUsersData = await AsyncStorage.getItem(STORAGE_KEYS.ALL_USERS);
    const allUsers = allUsersData ? JSON.parse(allUsersData) : [];
    const existingUser = allUsers.find((u: User & { subscriptionTier?: SubscriptionTier }) => u.email === normalizedEmail);
    
    let currentTier: SubscriptionTier = 'free';
    if (isNewUser) {
      currentTier = 'free';
      console.log('[Auth] ===== NEW USER REGISTRATION =====');
      console.log('[Auth] New user - assigning FREE tier (not premium)');
      console.log('[Auth] User will have 7-day free trial starting from registration');
    } else if (existingUser && existingUser.subscriptionTier) {
      currentTier = existingUser.subscriptionTier;
      console.log('[Auth] Found existing user tier:', currentTier);
    } else {
      const storedTier = await AsyncStorage.getItem(STORAGE_KEYS.TIER);
      currentTier = (storedTier as SubscriptionTier) || 'free';
      console.log('[Auth] Using stored tier:', currentTier);
    }
    
    setSubscriptionTier(currentTier);
    await AsyncStorage.setItem(STORAGE_KEYS.TIER, currentTier);
    console.log('[Auth] ✅ Set subscription tier to:', currentTier);
    
    const userRegistrationDate = existingUser?.registrationDate ?? (isNewUser ? new Date().toISOString() : undefined) ?? new Date().toISOString();
    
    let userAvatar = existingUser?.avatar ?? DEFAULT_AVATAR.url;
    if (isAdminEmail) {
      userAvatar = ADMIN_AVATAR.url;
    }
    
    const generateReferralCode = (userId: string) => {
      return 'WF' + userId.slice(-6).toUpperCase();
    };
    
    const userId = existingUser?.id ?? 'u-' + Date.now().toString();
    const referralCode = existingUser?.referralCode ?? generateReferralCode(userId);
    
    const newUser: User & { subscriptionTier: SubscriptionTier; registrationDate: string } = {
      id: userId,
      name: name ?? existingUser?.name ?? username ?? email.split('@')[0],
      email: normalizedEmail,
      isAdmin: isAdminEmail,
      avatar: userAvatar,
      subscriptionTier: currentTier,
      weightUnit: weightUnit ?? existingUser?.weightUnit ?? 'lbs',
      registrationDate: userRegistrationDate,
      height: height ?? existingUser?.height,
      weight: weight ?? existingUser?.weight,
      age: age ?? existingUser?.age,
      goal: goal ?? existingUser?.goal,
      referralCode: referralCode,
      referredBy: referredBy ?? existingUser?.referredBy,
      totalReferrals: existingUser?.totalReferrals ?? 0,
    };
    
    setRegistrationDate(userRegistrationDate);
    await AsyncStorage.setItem('warfare_registration_date', userRegistrationDate);
    console.log('[Auth] User login:', normalizedEmail, 'isAdmin:', newUser.isAdmin, 'isNewUser:', isNewUser, 'tier:', currentTier);
    setUser(newUser);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));
    
    const allUsersDataUpdated = await AsyncStorage.getItem(STORAGE_KEYS.ALL_USERS);
    const allUsersUpdated = allUsersDataUpdated ? JSON.parse(allUsersDataUpdated) : [];
    const userIndex = allUsersUpdated.findIndex((u: typeof newUser) => u.email === normalizedEmail);
    
    if (userIndex >= 0) {
      allUsersUpdated[userIndex] = newUser;
    } else {
      allUsersUpdated.push(newUser);
    }
    
    await AsyncStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(allUsersUpdated));

    if (isNewUser && referredBy) {
      console.log('[Auth] User referred by:', referredBy);
      const referrerUser = allUsersUpdated.find((u: typeof newUser) => u.referralCode === referredBy);
      if (referrerUser) {
        const referralBonus = 50;
        referrerUser.totalReferrals = (referrerUser.totalReferrals || 0) + 1;
        
        const referrerIndex = allUsersUpdated.findIndex((u: typeof newUser) => u.referralCode === referredBy);
        if (referrerIndex >= 0) {
          allUsersUpdated[referrerIndex] = referrerUser;
          await AsyncStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(allUsersUpdated));
        }
        
        const referrals = await AsyncStorage.getItem(STORAGE_KEYS.REFERRALS);
        const referralsList = referrals ? JSON.parse(referrals) : [];
        referralsList.push({
          referrerId: referrerUser.id,
          refereeId: newUser.id,
          refereeEmail: newUser.email,
          refereeName: newUser.name,
          date: new Date().toISOString(),
          powerBonus: referralBonus,
        });
        await AsyncStorage.setItem(STORAGE_KEYS.REFERRALS, JSON.stringify(referralsList));
        
        console.log('[Auth] Referral bonus:', referralBonus, 'power for user:', referrerUser.email);
      }
    }

    if (isNewUser) {
      console.log('[Auth] ===== INITIALIZING NEW USER =====');
      console.log('[Auth] Resetting all data for new user...');
      
      const freshMissions = MISSIONS.map(m => ({ ...m, completed: false, progress: 0 }));
      setStreak(0);
      setPowerLevel(0);
      setMissions(freshMissions);
      setHydrationMl(0);
      setMeals([]);
      const freshMetrics: PowerLevelMetrics = {
        loginStreak: 0,
        lastLoginDate: '',
        lastStreakMilestone: 0,
        totalWorkoutsCompleted: 0,
        totalSpent: 0,
      };
      setPowerMetrics(freshMetrics);
      const today = new Date().toDateString();
      
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.TIER, 'free'),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_LOGIN_DATE, today),
        AsyncStorage.setItem(STORAGE_KEYS.LAST_DATE, today),
        AsyncStorage.setItem(STORAGE_KEYS.STREAK, '0'),
        AsyncStorage.setItem(STORAGE_KEYS.POWER_LEVEL, '0'),
        AsyncStorage.setItem(STORAGE_KEYS.MISSIONS, JSON.stringify(freshMissions)),
        AsyncStorage.setItem(STORAGE_KEYS.HYDRATION, '0'),
        AsyncStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify([])),
        AsyncStorage.setItem(STORAGE_KEYS.POWER_METRICS, JSON.stringify(freshMetrics)),
        AsyncStorage.removeItem(STORAGE_KEYS.LAST_POST_DATE),
      ]);
      
      console.log('[Auth] ✅ New user initialized:');
      console.log('[Auth]    - Tier: FREE');
      console.log('[Auth]    - Streak: 0');
      console.log('[Auth]    - Power Level: 0');
      console.log('[Auth]    - Missions: Reset');
      console.log('[Auth]    - Free trial: 7 days from today');
      console.log('[Auth] ===== NEW USER INITIALIZATION COMPLETE =====');
      return;
    }

    const today = new Date().toDateString();
    const lastLoginDate = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOGIN_DATE);
    
    if (lastLoginDate !== today) {
      const currentStreak = await AsyncStorage.getItem(STORAGE_KEYS.STREAK);
      const currentPowerLevel = await AsyncStorage.getItem(STORAGE_KEYS.POWER_LEVEL);
      const storedMetrics = await AsyncStorage.getItem(STORAGE_KEYS.POWER_METRICS);
      
      let metrics: PowerLevelMetrics = storedMetrics ? JSON.parse(storedMetrics) : powerMetrics;
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();
      const isConsecutive = lastLoginDate === yesterdayStr;
      
      const newStreak = isConsecutive ? (currentStreak ? parseInt(currentStreak, 10) : 0) + 1 : 1;
      let powerBonus = 10;
      
      const streakMilestones = [10, 20, 30, 50, 75, 100];
      let milestoneBonus = 0;
      
      for (const milestone of streakMilestones) {
        if (newStreak >= milestone && metrics.lastStreakMilestone < milestone) {
          if (milestone === 10) milestoneBonus = 50;
          else if (milestone === 20) milestoneBonus = 100;
          else if (milestone === 30) milestoneBonus = 200;
          else if (milestone === 50) milestoneBonus = 350;
          else if (milestone === 75) milestoneBonus = 500;
          else if (milestone === 100) milestoneBonus = 1000;
          
          metrics.lastStreakMilestone = milestone;
          console.log(`[Auth] 🎉 Streak milestone reached! ${milestone} days → +${milestoneBonus} power`);
          break;
        }
      }
      
      const newPowerLevel = (currentPowerLevel ? parseInt(currentPowerLevel, 10) : 0) + powerBonus + milestoneBonus;
      
      metrics.loginStreak = newStreak;
      metrics.lastLoginDate = today;
      
      setStreak(newStreak);
      setPowerLevel(newPowerLevel);
      setPowerMetrics(metrics);
      
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.LAST_LOGIN_DATE, today),
        AsyncStorage.setItem(STORAGE_KEYS.STREAK, String(newStreak)),
        AsyncStorage.setItem(STORAGE_KEYS.POWER_LEVEL, String(newPowerLevel)),
        AsyncStorage.setItem(STORAGE_KEYS.POWER_METRICS, JSON.stringify(metrics)),
      ]);
      
      if (milestoneBonus > 0) {
        console.log(`[Auth] Daily login: +${powerBonus} power. Milestone bonus: +${milestoneBonus}. Total: +${powerBonus + milestoneBonus} power. New streak: ${newStreak}, New power level: ${newPowerLevel}`);
      } else {
        console.log('[Auth] Daily login bonus: +' + powerBonus + ' power. New streak:', newStreak, 'New power level:', newPowerLevel);
      }
    } else {
      console.log('[Auth] Already logged in today. Streak and power level unchanged.');
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(undefined);
    await AsyncStorage.removeItem(STORAGE_KEYS.USER);
  }, []);

  const updateUserAvatar = useCallback(async (avatarUri: string) => {
    if (!user) return;
    const updatedUser = { ...user, avatar: avatarUri };
    setUser(updatedUser);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
    
    const allUsersData = await AsyncStorage.getItem(STORAGE_KEYS.ALL_USERS);
    const allUsers = allUsersData ? JSON.parse(allUsersData) : [];
    const userIndex = allUsers.findIndex((u: User) => u.email === user.email);
    
    if (userIndex >= 0) {
      allUsers[userIndex] = updatedUser;
      await AsyncStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(allUsers));
      console.log('[Auth] Avatar updated in all users list:', avatarUri);
    }
    
    console.log('[Auth] Avatar updated:', avatarUri);
  }, [user]);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<User, 'id' | 'isAdmin'>>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
    
    const allUsersData = await AsyncStorage.getItem(STORAGE_KEYS.ALL_USERS);
    const allUsers = allUsersData ? JSON.parse(allUsersData) : [];
    const userIndex = allUsers.findIndex((u: User) => u.email === user.email);
    
    if (userIndex >= 0) {
      allUsers[userIndex] = updatedUser;
      await AsyncStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(allUsers));
      console.log('[Auth] Profile updated in all users list');
    }
    
    console.log('[Auth] Profile updated:', updates);
  }, [user]);



  const createMission = useCallback((missionData: Omit<Mission, 'id' | 'completed' | 'progress'>) => {
    const newMission: Mission = {
      ...missionData,
      id: Date.now().toString(),
      completed: false,
      progress: 0,
    };
    const updated = [...missions, newMission];
    setMissions(updated);
    void AsyncStorage.setItem(STORAGE_KEYS.MISSIONS, JSON.stringify(updated));
    console.log('[Admin] Created mission:', newMission.title);
  }, [missions]);

  const updateMission = useCallback((missionId: string, updates: Partial<Mission>) => {
    const updated = missions.map(m => m.id === missionId ? { ...m, ...updates } : m);
    setMissions(updated);
    void AsyncStorage.setItem(STORAGE_KEYS.MISSIONS, JSON.stringify(updated));
    console.log('[Admin] Updated mission:', missionId);
  }, [missions]);

  const deleteMission = useCallback((missionId: string) => {
    const updated = missions.filter(m => m.id !== missionId);
    setMissions(updated);
    void AsyncStorage.setItem(STORAGE_KEYS.MISSIONS, JSON.stringify(updated));
    console.log('[Admin] Deleted mission:', missionId);
  }, [missions]);

  const logIceBath = useCallback(async (durationMin: number) => {
    const bonusPower = 15;
    addPower(bonusPower);
    console.log('[IceBath] Ice bath logged:', durationMin, 'min. Bonus: +' + bonusPower + ' power');
    return bonusPower;
  }, [addPower]);

  const startFasting = useCallback(async (durationHours: number) => {
    if (!user) {
      console.error('[Fasting] Cannot start fasting - user not logged in');
      return;
    }
    
    const newState: FastingState = {
      userId: user.id,
      isActive: true,
      startTime: new Date().toISOString(),
      durationHours,
    };
    setFastingState(newState);
    await AsyncStorage.setItem(STORAGE_KEYS.FASTING_STATE, JSON.stringify(newState));
    console.log('[Fasting] Started fasting for', durationHours, 'hours', 'userId:', user.id);
  }, [user]);

  const endFasting = useCallback(async () => {
    if (!fastingState || !user) return;
    
    if (fastingState.userId !== user.id) {
      console.error('[Fasting] Cannot end fasting - fasting session belongs to different user');
      return;
    }
    
    const startTime = new Date(fastingState.startTime);
    const endTime = new Date();
    const actualHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    
    let bonusPower = 0;
    if (actualHours >= fastingState.durationHours) {
      bonusPower = Math.floor(fastingState.durationHours * 2);
      addPower(bonusPower);
      console.log('[Fasting] Completed fasting! Duration:', actualHours.toFixed(1), 'hours. Bonus: +' + bonusPower + ' power');
    } else {
      console.log('[Fasting] Ended fasting early. Duration:', actualHours.toFixed(1), 'hours');
    }
    
    setFastingState(undefined);
    await AsyncStorage.removeItem(STORAGE_KEYS.FASTING_STATE);
    return bonusPower;
  }, [fastingState, addPower, user]);

  const logIceBathEntry = useCallback(async (durationMin: number) => {
    const newLog: IceBathLog = {
      id: Date.now().toString(),
      durationMin,
      loggedAt: new Date().toISOString(),
    };
    const updated = [newLog, ...iceBaths];
    setIceBaths(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.ICE_BATHS, JSON.stringify(updated));
    
    const bonusPower = await logIceBath(durationMin);
    console.log('[IceBath] Logged ice bath:', durationMin, 'min. Bonus: +' + bonusPower + ' power');
    return bonusPower;
  }, [iceBaths, logIceBath]);

  const completeWorkout = useCallback(async (totalWorkouts: number) => {
    const bonusPower = 10;
    addPower(bonusPower);
    
    const updatedMetrics = {
      ...powerMetrics,
      totalWorkoutsCompleted: totalWorkouts,
    };
    setPowerMetrics(updatedMetrics);
    await AsyncStorage.setItem(STORAGE_KEYS.POWER_METRICS, JSON.stringify(updatedMetrics));
    
    console.log('[Workout] Workout completed. Bonus: +' + bonusPower + ' power. Total workouts:', totalWorkouts);
    return bonusPower;
  }, [addPower, powerMetrics]);

  const processPaymentSuccess = useCallback(async (tier: SubscriptionTier, amountPaid: number) => {
    console.log('[Payment] Processing successful payment:', { tier, amountPaid });
    
    setTier(tier);
    
    if (tier === 'premium' && amountPaid > 0) {
      const spendingBonus = Math.floor(amountPaid * 2);
      if (!isNaN(spendingBonus) && isFinite(spendingBonus)) {
        addPower(spendingBonus);
        
        const updatedMetrics = {
          ...powerMetrics,
          totalSpent: (powerMetrics.totalSpent || 0) + amountPaid,
        };
        setPowerMetrics(updatedMetrics);
        await AsyncStorage.setItem(STORAGE_KEYS.POWER_METRICS, JSON.stringify(updatedMetrics));
        
        console.log(`[Payment] Payment processed! ${amountPaid} paid. Bonus: +${spendingBonus} power. Total spent: ${updatedMetrics.totalSpent}`);
        
        Alert.alert(
          '🎉 Subscription Activated!',
          `Welcome to Premium! You earned +${spendingBonus} power for your purchase. Enjoy unlimited access!`,
          [{ text: 'Awesome!', style: 'default' }]
        );
      }
    }
  }, [setTier, addPower, powerMetrics]);

  const isInFreeTrial = useCallback(() => {
    if (!user || !user.registrationDate) return true;
    const regDate = new Date(user.registrationDate);
    regDate.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const daysSinceReg = Math.floor((now.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24));
    const trialDays = adminSettings.subscriptionPrices?.freeTrialDays ?? 7;
    console.log('[FreeTrial] Registration:', user.registrationDate, 'Days since reg:', daysSinceReg, 'Trial days:', trialDays, 'In trial:', daysSinceReg < trialDays);
    return daysSinceReg < trialDays;
  }, [user, adminSettings]);

  const getDaysRemainingInTrial = useCallback(() => {
    if (!user || !user.registrationDate) {
      const trialDays = adminSettings.subscriptionPrices?.freeTrialDays ?? 7;
      return trialDays;
    }
    const regDate = new Date(user.registrationDate);
    regDate.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const daysSinceReg = Math.floor((now.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24));
    const trialDays = adminSettings.subscriptionPrices?.freeTrialDays ?? 7;
    return Math.max(0, trialDays - daysSinceReg);
  }, [user, adminSettings]);

  const hasFullAccess = useCallback(() => {
    if (subscriptionTier === 'premium') return true;
    return isInFreeTrial();
  }, [subscriptionTier, isInFreeTrial]);

  return useMemo(
    () => ({
      isLoading,
      streak,
      powerLevel,
      missions,
      addPower,
      incrementStreak,
      hydrationMl,
      hydrationTargetMl,
      addWater,
      resetHydration,
      updateHydrationTarget,
      calorieTarget,
      setDailyCalorieTarget,
      meals,
      addMeal,
      subscriptionTier,
      setTier,
      adminSettings,
      updateAdminSettings,
      beginCheckout,
      getTodayMeals,

      user,
      login,
      logout,
      updateUserAvatar,
      updateUserProfile,
      createMission,
      updateMission,
      deleteMission,
      logIceBath,
      completeWorkout,
      powerMetrics,
      processPaymentSuccess,
      fastingState,
      startFasting,
      endFasting,
      iceBaths,
      logIceBathEntry,
      isInFreeTrial,
      hasFullAccess,
      getDaysRemainingInTrial,
    }),
    [
      isLoading,
      streak,
      powerLevel,
      missions,
      addPower,
      incrementStreak,
      hydrationMl,
      hydrationTargetMl,
      addWater,
      resetHydration,
      updateHydrationTarget,
      calorieTarget,
      setDailyCalorieTarget,
      meals,
      addMeal,
      subscriptionTier,
      setTier,
      adminSettings,
      updateAdminSettings,
      beginCheckout,
      getTodayMeals,

      user,
      login,
      logout,
      updateUserAvatar,
      updateUserProfile,
      createMission,
      updateMission,
      deleteMission,
      logIceBath,
      completeWorkout,
      powerMetrics,
      processPaymentSuccess,
      fastingState,
      startFasting,
      endFasting,
      iceBaths,
      logIceBathEntry,
      isInFreeTrial,
      hasFullAccess,
      getDaysRemainingInTrial,
    ]
  );
});

export const STREAK_MILESTONES = [
  { days: 10, power: 50 },
  { days: 20, power: 100 },
  { days: 30, power: 200 },
  { days: 50, power: 350 },
  { days: 75, power: 500 },
  { days: 100, power: 1000 },
];

export function getUserRank(totalWorkouts: number): string {
  if (totalWorkouts >= 500) return 'General';
  if (totalWorkouts >= 250) return 'Colonel';
  if (totalWorkouts >= 150) return 'Major';
  if (totalWorkouts >= 100) return 'Captain';
  if (totalWorkouts >= 60) return 'Lieutenant';
  if (totalWorkouts >= 30) return 'Sergeant';
  if (totalWorkouts >= 15) return 'Corporal';
  if (totalWorkouts >= 5) return 'Private';
  return 'Recruit';
}

export type AppContextType = ReturnType<typeof useApp>;
export type { DailyBriefing, FreePackageFeatures };