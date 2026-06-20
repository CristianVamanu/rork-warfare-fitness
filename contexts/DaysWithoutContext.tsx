import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DaysWithoutChallenge {
  id: string;
  name: string;
  startDate: string;
  targetDays?: number;
  targetUnit?: 'days' | 'weeks' | 'months';
  isActive: boolean;
  lastResetDate?: string;
  totalResets: number;
  bestStreak: number;
}

const STORAGE_KEY_PREFIX = 'warfare_days_without_';
const ANONYMOUS_KEY = `${STORAGE_KEY_PREFIX}anonymous`;

const SUGGESTED_CHALLENGES = [
  'Quit Smoking',
  'Quit Porn',
  'Quit Drinking',
  'No Sugar',
  'No Social Media',
  'No Fast Food',
  'No Energy Drinks',
];

export const [DaysWithoutProvider, useDaysWithout] = createContextHook(() => {
  const [challenges, setChallenges] = useState<DaysWithoutChallenge[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [storageKey, setStorageKey] = useState<string>(ANONYMOUS_KEY);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userData = await AsyncStorage.getItem('warfare_user');
        let key = ANONYMOUS_KEY;

        if (userData) {
          const user = JSON.parse(userData);
          if (user?.id) {
            setCurrentUserId(user.id);
            key = `${STORAGE_KEY_PREFIX}${user.id}`;

            // Migrate anonymous challenges to user account on first login
            const anonData = await AsyncStorage.getItem(ANONYMOUS_KEY);
            const userStoredData = await AsyncStorage.getItem(key);
            if (anonData && !userStoredData) {
              await AsyncStorage.setItem(key, anonData);
              await AsyncStorage.removeItem(ANONYMOUS_KEY);
            }
          }
        }

        setStorageKey(key);
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          setChallenges(JSON.parse(stored));
        }
      } catch (error) {
        console.error('[DaysWithout] Error loading challenges:', error);
      } finally {
        setIsLoading(false);
      }
    };
    void loadUserData();
  }, []);

  const saveChallenges = useCallback(async (newChallenges: DaysWithoutChallenge[]) => {
    // Always update in-memory state immediately for responsive UI
    setChallenges(newChallenges);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(newChallenges));
    } catch (error) {
      console.error('[DaysWithout] Error saving challenges:', error);
    }
  }, [storageKey]);

  const getDaysCount = useCallback((startDate: string): number => {
    const start = new Date(startDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - start.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }, []);

  const addChallenge = useCallback(async (name: string, targetDays?: number, targetUnit?: 'days' | 'weeks' | 'months') => {
    const newChallenge: DaysWithoutChallenge = {
      id: Date.now().toString(),
      name,
      startDate: new Date().toISOString(),
      targetDays,
      targetUnit,
      isActive: true,
      totalResets: 0,
      bestStreak: 0,
    };
    const updated = [...challenges, newChallenge];
    await saveChallenges(updated);
  }, [challenges, saveChallenges]);

  const resetChallenge = useCallback(async (challengeId: string) => {
    const updated = challenges.map(c => {
      if (c.id === challengeId) {
        const currentStreak = getDaysCount(c.startDate);
        return {
          ...c,
          startDate: new Date().toISOString(),
          lastResetDate: c.startDate,
          totalResets: c.totalResets + 1,
          bestStreak: Math.max(c.bestStreak, currentStreak),
        };
      }
      return c;
    });
    await saveChallenges(updated);
  }, [challenges, saveChallenges, getDaysCount]);

  const deleteChallenge = useCallback(async (challengeId: string) => {
    const updated = challenges.filter(c => c.id !== challengeId);
    await saveChallenges(updated);
  }, [challenges, saveChallenges]);

  const toggleChallengeActive = useCallback(async (challengeId: string) => {
    const updated = challenges.map(c =>
      c.id === challengeId ? { ...c, isActive: !c.isActive } : c
    );
    await saveChallenges(updated);
  }, [challenges, saveChallenges]);

  const getTimeElapsed = useCallback((startDate: string): { days: number; hours: number; minutes: number; seconds: number } => {
    const start = new Date(startDate);
    const now = new Date();
    const diffTime = Math.max(0, now.getTime() - start.getTime());

    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffTime % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds };
  }, []);

  const getTargetDaysCount = useCallback((targetDays?: number, targetUnit?: 'days' | 'weeks' | 'months'): number | undefined => {
    if (!targetDays || !targetUnit) return undefined;

    switch (targetUnit) {
      case 'days': return targetDays;
      case 'weeks': return targetDays * 7;
      case 'months': return targetDays * 30;
      default: return targetDays;
    }
  }, []);

  return useMemo(
    () => ({
      challenges,
      isLoading,
      addChallenge,
      resetChallenge,
      deleteChallenge,
      toggleChallengeActive,
      getDaysCount,
      getTimeElapsed,
      getTargetDaysCount,
      suggestedChallenges: SUGGESTED_CHALLENGES,
    }),
    [challenges, isLoading, addChallenge, resetChallenge, deleteChallenge, toggleChallengeActive, getDaysCount, getTimeElapsed, getTargetDaysCount]
  );
});
