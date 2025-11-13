import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/contexts/AppContext';
import { useTraining, ExercisePerformance } from '@/contexts/TrainingContext';

export type MilitaryRank = 
  | 'Recruit'
  | 'Cadet'
  | 'Soldier'
  | 'Operator'
  | 'Elite'
  | 'Warlord';

export interface RankThresholds {
  rank: MilitaryRank;
  minScore: number;
  color: string;
}

export const RANK_THRESHOLDS: RankThresholds[] = [
  { rank: 'Recruit', minScore: 0, color: '#808080' },
  { rank: 'Cadet', minScore: 500, color: '#A0522D' },
  { rank: 'Soldier', minScore: 2000, color: '#4682B4' },
  { rank: 'Operator', minScore: 5000, color: '#9370DB' },
  { rank: 'Elite', minScore: 10000, color: '#FFD700' },
  { rank: 'Warlord', minScore: 25000, color: '#FF4500' },
];

export const MINIMUM_WORKOUTS_BETWEEN_RANKS = 30;

export interface UserRankData {
  userId: string;
  rank: MilitaryRank;
  rankScore: number;
  totalVolume: number;
  workoutsLogged: number;
  consistencyFactor: number;
  lastWorkoutDate?: string;
}

const STORAGE_KEYS = {
  USER_RANK_DATA: 'warfare_user_rank_data',
};

export const [RankingProvider, useRanking] = createContextHook(() => {
  const { user } = useApp();
  const { exercisePerformances, workoutLogs } = useTraining();
  const [userRankData, setUserRankData] = useState<UserRankData | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[Ranking] Loading rank data...');
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.USER_RANK_DATA);
        if (stored) {
          try {
            setUserRankData(JSON.parse(stored));
            console.log('[Ranking] Rank data loaded');
          } catch (err) {
            console.error('[Ranking] Failed to parse rank data:', err);
          }
        }
      } catch (error) {
        console.error('[Ranking] Error loading rank data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    void loadData();
  }, []);

  const calculateConsistencyFactor = useCallback((): number => {
    if (!workoutLogs || workoutLogs.length === 0) return 0;

    const now = new Date();
    const last30Days = workoutLogs.filter(log => {
      const logDate = new Date(log.completedAt);
      const daysDiff = (now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30;
    });

    const workoutsPerWeek = (last30Days.length / 30) * 7;
    
    if (workoutsPerWeek >= 5) return 1.5;
    if (workoutsPerWeek >= 4) return 1.3;
    if (workoutsPerWeek >= 3) return 1.2;
    if (workoutsPerWeek >= 2) return 1.1;
    return 1.0;
  }, [workoutLogs]);

  const calculateRankScore = useCallback((
    performances: ExercisePerformance[],
    workoutCount: number
  ): number => {
    if (performances.length === 0) return 0;

    const totalVolume = performances.reduce((sum, perf) => sum + (perf.weight * perf.reps), 0);
    
    const repsFactor = 1.0;
    const consistencyFactor = calculateConsistencyFactor();

    const rankScore = totalVolume * repsFactor * consistencyFactor;
    
    console.log('[Ranking] Score calculation:', {
      totalVolume,
      repsFactor,
      consistencyFactor,
      rankScore: Math.floor(rankScore),
    });

    return Math.floor(rankScore);
  }, [calculateConsistencyFactor]);

  const getRankFromScore = useCallback((score: number, workoutCount: number): MilitaryRank => {
    for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
      if (score >= RANK_THRESHOLDS[i].minScore) {
        const requiredWorkouts = i * MINIMUM_WORKOUTS_BETWEEN_RANKS;
        if (workoutCount >= requiredWorkouts) {
          return RANK_THRESHOLDS[i].rank;
        }
      }
    }
    return 'Recruit';
  }, []);

  const getRankColor = useCallback((rank: MilitaryRank): string => {
    const threshold = RANK_THRESHOLDS.find(t => t.rank === rank);
    return threshold?.color ?? '#808080';
  }, []);

  const getNextRank = useCallback((currentRank: MilitaryRank): { rank: MilitaryRank; minScore: number } | null => {
    const currentIndex = RANK_THRESHOLDS.findIndex(t => t.rank === currentRank);
    if (currentIndex === -1 || currentIndex === RANK_THRESHOLDS.length - 1) return null;
    
    const nextThreshold = RANK_THRESHOLDS[currentIndex + 1];
    return { rank: nextThreshold.rank, minScore: nextThreshold.minScore };
  }, []);

  const getProgressToNextRank = useCallback((score: number, currentRank: MilitaryRank): number => {
    const next = getNextRank(currentRank);
    if (!next) return 100;

    const currentThreshold = RANK_THRESHOLDS.find(t => t.rank === currentRank);
    if (!currentThreshold) return 0;

    const progress = ((score - currentThreshold.minScore) / (next.minScore - currentThreshold.minScore)) * 100;
    return Math.min(100, Math.max(0, progress));
  }, [getNextRank]);

  const updateUserRank = useCallback(async () => {
    if (!user) {
      console.log('[Ranking] No user logged in, skipping rank update');
      return;
    }

    const userPerformances = (exercisePerformances || []).filter(p => p.userId === user.id);
    const userWorkouts = (workoutLogs || []).filter(w => w.exercises && w.exercises.length > 0);
    
    const totalVolume = userPerformances.reduce((sum, p) => sum + (p.weight * p.reps), 0);
    const rankScore = calculateRankScore(userPerformances, userWorkouts.length);
    const rank = getRankFromScore(rankScore, userWorkouts.length);
    const consistencyFactor = calculateConsistencyFactor();

    const lastWorkout = userWorkouts.length > 0 
      ? userWorkouts.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
      : undefined;

    const newRankData: UserRankData = {
      userId: user.id,
      rank,
      rankScore,
      totalVolume,
      workoutsLogged: userWorkouts.length,
      consistencyFactor,
      lastWorkoutDate: lastWorkout?.completedAt,
    };

    const oldRank = userRankData?.rank;
    setUserRankData(newRankData);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_RANK_DATA, JSON.stringify(newRankData));

    if (oldRank && oldRank !== rank) {
      console.log('[Ranking] 🎉 RANK UP!', oldRank, '→', rank);
    }

    console.log('[Ranking] Updated user rank:', {
      rank,
      rankScore,
      totalVolume,
      workoutsLogged: userWorkouts.length,
      consistencyFactor,
    });

    return { oldRank, newRank: rank, didRankUp: oldRank !== undefined && oldRank !== rank };
  }, [user, exercisePerformances, workoutLogs, calculateRankScore, getRankFromScore, calculateConsistencyFactor, userRankData]);

  const getAllUsersRankData = useCallback((): UserRankData[] => {
    const userPerformanceMap = new Map<string, ExercisePerformance[]>();
    
    for (const perf of (exercisePerformances || [])) {
      if (!userPerformanceMap.has(perf.userId)) {
        userPerformanceMap.set(perf.userId, []);
      }
      userPerformanceMap.get(perf.userId)!.push(perf);
    }

    const allRankData: UserRankData[] = [];

    for (const [userId, perfs] of userPerformanceMap) {
      const userWorkouts = (workoutLogs || []).filter(w => {
        return w.exercises && w.exercises.length > 0;
      });

      const totalVolume = perfs.reduce((sum, p) => sum + (p.weight * p.reps), 0);
      const rankScore = calculateRankScore(perfs, userWorkouts.length);
      const rank = getRankFromScore(rankScore, userWorkouts.length);

      allRankData.push({
        userId,
        rank,
        rankScore,
        totalVolume,
        workoutsLogged: userWorkouts.length,
        consistencyFactor: 1.0,
      });
    }

    return allRankData.sort((a, b) => b.rankScore - a.rankScore);
  }, [exercisePerformances, workoutLogs, calculateRankScore, getRankFromScore]);

  const getUserGlobalRank = useCallback((userId: string): number => {
    const allRanks = getAllUsersRankData();
    const userIndex = allRanks.findIndex(r => r.userId === userId);
    return userIndex === -1 ? 0 : userIndex + 1;
  }, [getAllUsersRankData]);

  const getTopPercentile = useCallback((userId: string): string => {
    const allRanks = getAllUsersRankData();
    if (allRanks.length === 0) return '100%';
    
    const userRank = getUserGlobalRank(userId);
    if (userRank === 0) return '100%';

    const percentile = (userRank / allRanks.length) * 100;
    
    if (percentile <= 1) return 'Top 1%';
    if (percentile <= 5) return 'Top 5%';
    if (percentile <= 10) return 'Top 10%';
    if (percentile <= 25) return 'Top 25%';
    if (percentile <= 50) return 'Top 50%';
    return `Top ${Math.ceil(percentile)}%`;
  }, [getAllUsersRankData, getUserGlobalRank]);

  useEffect(() => {
    if (!isLoading && user) {
      void updateUserRank();
    }
  }, [(exercisePerformances || []).length, (workoutLogs || []).length, isLoading, user?.id]);

  return useMemo(
    () => ({
      userRankData,
      isLoading,
      calculateRankScore,
      getRankFromScore,
      getRankColor,
      getNextRank,
      getProgressToNextRank,
      updateUserRank,
      getAllUsersRankData,
      getUserGlobalRank,
      getTopPercentile,
    }),
    [
      userRankData,
      isLoading,
      calculateRankScore,
      getRankFromScore,
      getRankColor,
      getNextRank,
      getProgressToNextRank,
      updateUserRank,
      getAllUsersRankData,
      getUserGlobalRank,
      getTopPercentile,
    ]
  );
});

export type RankingContextType = ReturnType<typeof useRanking>;
