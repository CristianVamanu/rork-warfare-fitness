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

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userData = await AsyncStorage.getItem('warfare_user');
        if (userData) {
          const user = JSON.parse(userData);
          setCurrentUserId(user.id);
          
          const userStorageKey = `${STORAGE_KEY_PREFIX}${user.id}`;
          const stored = await AsyncStorage.getItem(userStorageKey);
          if (stored) {
            setChallenges(JSON.parse(stored));
            console.log('[DaysWithout] Loaded challenges for user:', user.id);
          } else {
            console.log('[DaysWithout] No challenges found for user:', user.id);
          }
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
    try {
      if (!currentUserId) {
        console.error('[DaysWithout] Cannot save - no user logged in');
        return;
      }
      const userStorageKey = `${STORAGE_KEY_PREFIX}${currentUserId}`;
      await AsyncStorage.setItem(userStorageKey, JSON.stringify(newChallenges));
      setChallenges(newChallenges);
      console.log('[DaysWithout] Saved challenges for user:', currentUserId);
    } catch (error) {
      console.error('[DaysWithout] Error saving challenges:', error);
    }
  }, [currentUserId]);

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
    console.log('[DaysWithout] Challenge added:', name);
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
    console.log('[DaysWithout] Challenge reset:', challengeId);
  }, [challenges, saveChallenges, getDaysCount]);

  const deleteChallenge = useCallback(async (challengeId: string) => {
    const updated = challenges.filter(c => c.id !== challengeId);
    await saveChallenges(updated);
    console.log('[DaysWithout] Challenge deleted:', challengeId);
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
    const diffTime = now.getTime() - start.getTime();
    
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffTime % (1000 * 60)) / 1000);
    
    return { days, hours, minutes, seconds };
  }, []);

  const getTargetDaysCount = useCallback((targetDays?: number, targetUnit?: 'days' | 'weeks' | 'months'): number | undefined => {
    if (!targetDays || !targetUnit) return undefined;
    
    switch (targetUnit) {
      case 'days':
        return targetDays;
      case 'weeks':
        return targetDays * 7;
      case 'months':
        return targetDays * 30;
      default:
        return targetDays;
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
