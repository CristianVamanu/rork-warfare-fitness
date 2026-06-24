import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

import { MISSIONS, Mission } from '@/constants/missions';
import { ADMIN_AVATAR, DEFAULT_AVATAR } from '@/constants/avatars';
import { getFirebaseAuth, getFirebaseDb, logFirebaseDiagnostic } from '@/lib/firebase-client';
import { syncDocToFirestore, loadCollectionFromFirestore } from '@/lib/firestore-sync';



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

  freePackage: FreePackageFeatures;
  appName: string;
  tagline: string;
  supportEmail: string;

  welcomeMessage?: string;
  welcomeVideoUrl?: string;
  dailyMessage?: string;
  aiApiKey?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  dailyBriefings?: DailyBriefing[];
  appLogo?: string;
  coffeeLink?: string;
  defaultTrialDays?: number;
  platformRevenueSplit?: number;
  requireTrainerApproval?: boolean;
  stripePaymentLink?: string;
  stripePortalLink?: string;
  monthlyPrice?: string;
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
  resetPin?: string;

  powerLevelSnapshot?: number;
  isTrainer?: boolean;
  trainerBio?: string;
  trainerSpecialty?: string;
  trainerPrice?: number;
  trainerTrialDays?: number;
  trainerRevenueSplit?: number;
  trainerApproved?: boolean;
}

// Admin emails are configured server-side via ADMIN_EMAILS env var.
// Client-side admin detection reads from the user's Firestore profile.
// No hardcoded credentials.

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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [streak, setStreak] = useState<number>(0);
  const [powerLevel, setPowerLevel] = useState<number>(0);
  const [missions, setMissions] = useState<Mission[]>(MISSIONS);

  const [hydrationMl, setHydrationMl] = useState<number>(0);
  const [hydrationTargetMl, setHydrationTargetMl] = useState<number>(2500);

  const [calorieTarget, setCalorieTarget] = useState<number>(2400);
  const [meals, setMeals] = useState<MealEntry[]>([]);


  const [, setRegistrationDate] = useState<string | undefined>(undefined);

  const [adminSettings, setAdminSettings] = useState<AdminAppSettings>({
    enableNotifications: true,
    requireVerification: false,

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

  const [powerMetrics, setPowerMetrics] = useState<PowerLevelMetrics>({
    loginStreak: 0,
    lastLoginDate: '',
    lastStreakMilestone: 0,
    totalWorkoutsCompleted: 0,
    totalSpent: 0,
  });
  const [fastingState, setFastingState] = useState<FastingState | undefined>(undefined);
  const [iceBaths, setIceBaths] = useState<IceBathLog[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        console.log('[AppContext] Loading persisted data...');

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

        // Load meals: prefer Firestore (cross-device), fall back to AsyncStorage
        // Note: user is not yet available in this loadPersistedData closure;
        // Firestore meal load is handled via onAuthStateChanged side-effect below.
        const storedMeals = await AsyncStorage.getItem(STORAGE_KEYS.MEALS);
        if (storedMeals) {
          try {
            setMeals(JSON.parse(storedMeals));
          } catch {}
        }



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

        const cachedUserRaw = await AsyncStorage.getItem(STORAGE_KEYS.USER);
        if (cachedUserRaw) {
          try {
            const currentUser = JSON.parse(cachedUserRaw) as User;
            const storedFasting = await AsyncStorage.getItem(STORAGE_KEYS.FASTING_STATE);
            if (storedFasting) {
              try {
                const fastingData = JSON.parse(storedFasting) as FastingState;
                if (fastingData.userId === currentUser.id) {
                  setFastingState(fastingData);
                } else {
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

        const storedAllUsers = await AsyncStorage.getItem(STORAGE_KEYS.ALL_USERS);
        if (storedAllUsers) {
          try {
            setAllUsers(JSON.parse(storedAllUsers));
          } catch {}
        }

        console.log('[AppContext] Persisted data loaded');
      } catch (error) {
        console.error('[AppContext] Error loading data:', error);
      }
    };

    void loadPersistedData();

    // Firebase Auth manages session — fires once on mount with current user (or null)
    const auth = getFirebaseAuth();
    if (!auth) {
      // Firebase not configured yet — mark loading done
      setIsLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const db = getFirebaseDb();
        let profile: User | null = null;
        if (db) {
          try {
            const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (snap.exists()) {
              profile = snap.data() as User;
            }
          } catch (e) {
            console.error('[AppContext] Failed to load Firestore profile:', e);
          }
        }
        if (!profile) {
          // Fall back to AsyncStorage profile (pre-migration users)
          const storedUser = await AsyncStorage.getItem(STORAGE_KEYS.USER);
          if (storedUser) {
            try { profile = JSON.parse(storedUser) as User; } catch {}
          }
        }
        if (profile) {
          setUser(profile);
        }
      } else {
        setUser(undefined);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
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

  const addMeal = useCallback((entry: Omit<MealEntry, 'id' | 'loggedAt'>, uid?: string) => {
    const newEntry: MealEntry = { id: Date.now().toString(), loggedAt: new Date().toISOString(), ...entry };
    const next = [newEntry, ...meals];
    setMeals(next);
    void AsyncStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(next));
    // Dual-write to Firestore
    if (uid) {
      const db = getFirebaseDb();
      void syncDocToFirestore(db, ['users', uid, 'meals', newEntry.id], newEntry);
    }
  }, [meals]);



  const updateAdminSettings = useCallback((updates: Partial<AdminAppSettings>) => {
    const next = { ...adminSettings, ...updates };
    setAdminSettings(next);
    void AsyncStorage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify(next));
  }, [adminSettings]);





  const getTodayMeals = useCallback(() => {
    const todayStr = new Date().toDateString();
    return meals.filter(m => new Date(m.loggedAt).toDateString() === todayStr);
  }, [meals]);



  const login = useCallback(async (email: string, name?: string, password?: string, isNewUser: boolean = false, username?: string, weightUnit?: 'lbs' | 'kg', height?: string, weight?: string, age?: string, goal?: string, referredBy?: string, _resetPin?: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    console.log('[AppContext.login] called — email:', normalizedEmail, 'isNewUser:', isNewUser);
    if (!password) throw new Error('Password required');

    const auth = getFirebaseAuth();
    console.log('[AppContext.login] getFirebaseAuth() result:', auth ? 'OK' : 'NULL — check EXPO_PUBLIC_FIREBASE_* env vars in Vercel');
    if (!auth) {
      logFirebaseDiagnostic();
      throw new Error('Firebase is not configured. Check that EXPO_PUBLIC_FIREBASE_* variables are set in Vercel and redeploy.');
    }

    // Authenticate via Firebase Auth
    let firebaseUid: string;
    let displayName: string;

    if (isNewUser) {
      console.log('[AppContext.login] calling createUserWithEmailAndPassword...');
      const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      console.log('[AppContext.login] createUserWithEmailAndPassword succeeded, uid:', cred.user.uid);
      firebaseUid = cred.user.uid;
      displayName = name ?? username ?? normalizedEmail.split('@')[0];
      await updateProfile(cred.user, { displayName });
    } else {
      console.log('[AppContext.login] calling signInWithEmailAndPassword...');
      const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      console.log('[AppContext.login] signInWithEmailAndPassword succeeded, uid:', cred.user.uid);
      firebaseUid = cred.user.uid;
      displayName = cred.user.displayName ?? name ?? normalizedEmail.split('@')[0];
    }

    // Load existing Firestore profile to preserve fields like avatar, referralCode, etc.
    const db = getFirebaseDb();
    let existingProfile: Partial<User> = {};
    if (db) {
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUid));
        if (snap.exists()) existingProfile = snap.data() as User;
      } catch (e) {
        console.error('[Auth] Failed to load Firestore profile:', e);
      }
    }

    // Admin flag comes from Firestore profile (set by admin SDK)
    const isAdmin = existingProfile.isAdmin === true;

    const referralCode = existingProfile.referralCode ?? ('WF' + firebaseUid.slice(-6).toUpperCase());
    const userRegistrationDate = existingProfile.registrationDate ?? new Date().toISOString();

    const newUser: User & { registrationDate: string } = {
      id: firebaseUid,
      name: displayName,
      email: normalizedEmail,
      isAdmin,
      avatar: existingProfile.avatar ?? (isAdmin ? ADMIN_AVATAR.url : DEFAULT_AVATAR.url),
      weightUnit: weightUnit ?? existingProfile.weightUnit ?? 'lbs',
      registrationDate: userRegistrationDate,
      height: height ?? existingProfile.height,
      weight: weight ?? existingProfile.weight,
      age: age ?? existingProfile.age,
      goal: goal ?? existingProfile.goal,
      referralCode,
      referredBy: referredBy ?? existingProfile.referredBy,
      totalReferrals: existingProfile.totalReferrals ?? 0,
      isTrainer: existingProfile.isTrainer ?? false,
      trainerBio: existingProfile.trainerBio,
      trainerSpecialty: existingProfile.trainerSpecialty,
      trainerPrice: existingProfile.trainerPrice,
      trainerTrialDays: existingProfile.trainerTrialDays,
      trainerRevenueSplit: existingProfile.trainerRevenueSplit,
      trainerApproved: existingProfile.trainerApproved ?? false,
    };

    setRegistrationDate(userRegistrationDate);
    await AsyncStorage.setItem('warfare_registration_date', userRegistrationDate);
    console.log('[Auth] Firebase login:', normalizedEmail, 'isAdmin:', isAdmin, 'isNewUser:', isNewUser);
    setUser(newUser);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(newUser));

    // Persist profile to Firestore
    if (db) {
      try {
        await setDoc(doc(db, 'users', firebaseUid), { ...newUser, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) {
        console.error('[Auth] Firestore profile write failed:', e);
      }
    }

    if (isNewUser) {
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
      return;
    }

    // Returning user — handle daily streak & power bonus
    const today = new Date().toDateString();
    const lastLoginDate = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOGIN_DATE);

    if (lastLoginDate !== today) {
      const currentStreak = await AsyncStorage.getItem(STORAGE_KEYS.STREAK);
      const currentPowerLevel = await AsyncStorage.getItem(STORAGE_KEYS.POWER_LEVEL);
      const storedMetrics = await AsyncStorage.getItem(STORAGE_KEYS.POWER_METRICS);
      let metrics: PowerLevelMetrics = storedMetrics ? JSON.parse(storedMetrics) : powerMetrics;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isConsecutive = lastLoginDate === yesterday.toDateString();
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
      console.log('[Auth] Daily login: +' + (powerBonus + milestoneBonus) + ' power. Streak:', newStreak);
    }
  }, [powerMetrics]);

  const logout = useCallback(async () => {
    setUser(undefined);
    // Clear all user session data; preserve device-level preferences (theme, units, etc.)
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER,
      STORAGE_KEYS.ALL_USERS,
      STORAGE_KEYS.FASTING_STATE,
      'community_messages',
      'active_program_id',
      'workout_logs',
      'training_state',
    ]);
    const auth = getFirebaseAuth();
    if (auth) {
      try { await signOut(auth); } catch {}
    }
  }, []);

  const updateUserAvatar = useCallback(async (avatarUri: string) => {
    if (!user) return;
    const updatedUser = { ...user, avatar: avatarUri };
    setUser(updatedUser);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
    const db = getFirebaseDb();
    if (db) {
      try { await updateDoc(doc(db, 'users', user.id), { avatar: avatarUri, updatedAt: new Date().toISOString() }); } catch {}
    }
  }, [user]);

  const updateUserProfile = useCallback(async (updates: Partial<Omit<User, 'id' | 'isAdmin'>>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
    const db = getFirebaseDb();
    if (db) {
      try { await updateDoc(doc(db, 'users', user.id), { ...updates, updatedAt: new Date().toISOString() }); } catch {}
    }
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
    
    setPowerMetrics(prev => {
      const updatedMetrics = {
        ...prev,
        totalWorkoutsCompleted: totalWorkouts,
      };
      void AsyncStorage.setItem(STORAGE_KEYS.POWER_METRICS, JSON.stringify(updatedMetrics));
      return updatedMetrics;
    });
    
    console.log('[Workout] Workout completed. Bonus: +' + bonusPower + ' power. Total workouts:', totalWorkouts);
    return bonusPower;
  }, [addPower]);



  const hasFullAccess = useCallback(() => {
    return true;
  }, []);

  const promoteToTrainer = useCallback(async (userId: string) => {
    const updated = allUsers.map(u =>
      u.id === userId ? { ...u, isTrainer: true, trainerApproved: true, trainerRevenueSplit: 70 } : u
    );
    setAllUsers(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(updated));
    const db = getFirebaseDb();
    if (db) {
      try { await updateDoc(doc(db, 'users', userId), { isTrainer: true, trainerApproved: true, trainerRevenueSplit: 70, updatedAt: new Date().toISOString() }); } catch {}
    }
    if (user?.id === userId) {
      const updatedUser = { ...user, isTrainer: true, trainerApproved: true, trainerRevenueSplit: 70 };
      setUser(updatedUser);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
    }
  }, [allUsers, user]);

  const revokeTrainer = useCallback(async (userId: string) => {
    const updated = allUsers.map(u =>
      u.id === userId ? { ...u, isTrainer: false, trainerApproved: false } : u
    );
    setAllUsers(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(updated));
    const db = getFirebaseDb();
    if (db) {
      try { await updateDoc(doc(db, 'users', userId), { isTrainer: false, trainerApproved: false, updatedAt: new Date().toISOString() }); } catch {}
    }
    if (user?.id === userId) {
      const updatedUser = { ...user, isTrainer: false, trainerApproved: false };
      setUser(updatedUser);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
    }
  }, [allUsers, user]);

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

      adminSettings,
      updateAdminSettings,

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

      fastingState,
      startFasting,
      endFasting,
      iceBaths,
      logIceBathEntry,
      hasFullAccess,
      allUsers,
      promoteToTrainer,
      revokeTrainer,
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

      adminSettings,
      updateAdminSettings,

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

      fastingState,
      startFasting,
      endFasting,
      iceBaths,
      logIceBathEntry,
      hasFullAccess,
      allUsers,
      promoteToTrainer,
      revokeTrainer,
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