import createContextHook from '@nkzw/create-context-hook';
import { useMemo, useCallback, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/contexts/AppContext';
import { useTraining, ExercisePerformance } from '@/contexts/TrainingContext';
import { useRanking } from '@/contexts/RankingContext';

export type TimeFilter = 'week' | 'month' | 'all-time';
export type ExerciseLeaderboardEntry = {
  userId: string;
  userName: string;
  avatar?: string;
  weight: number;
  reps: number;
  totalVolume: number;
  rank: number;
  timestamp: string;
};

export type GlobalLeaderboardEntry = {
  userId: string;
  userName: string;
  avatar?: string;
  rankScore: number;
  totalVolume: number;
  workoutsLogged: number;
  militaryRank: string;
  rank: number;
};

interface UserData {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export const [LeaderboardProvider, useLeaderboard] = createContextHook(() => {
  const { user } = useApp();
  const { exercisePerformances, workoutLogs } = useTraining();
  const { getAllUsersRankData } = useRanking();
  const [allUsersData, setAllUsersData] = useState<UserData[]>([]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await AsyncStorage.getItem('warfare_all_users');
        if (usersData) {
          setAllUsersData(JSON.parse(usersData));
          console.log('[Leaderboard] Loaded user data for', JSON.parse(usersData).length, 'users');
        }
      } catch (error) {
        console.error('[Leaderboard] Failed to load users:', error);
      }
    };
    void loadUsers();

    const interval = setInterval(() => {
      void loadUsers();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const filterByTime = useCallback((performances: ExercisePerformance[], filter: TimeFilter): ExercisePerformance[] => {
    if (filter === 'all-time') return performances || [];

    const now = new Date();
    const daysAgo = filter === 'week' ? 7 : 30;
    const cutoffDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    return (performances || []).filter(p => new Date(p.timestamp) >= cutoffDate);
  }, []);

  const getExerciseLeaderboard = useCallback(
    (exerciseName: string, timeFilter: TimeFilter = 'all-time'): ExerciseLeaderboardEntry[] => {
      const filtered = filterByTime(exercisePerformances || [], timeFilter).filter(
        p => p.exerciseName === exerciseName
      );

      const userBestMap = new Map<string, ExercisePerformance>();
      
      for (const perf of filtered) {
        const existing = userBestMap.get(perf.userId);
        const currentScore = perf.weight * perf.reps;
        const existingScore = existing ? existing.weight * existing.reps : 0;
        
        if (!existing || currentScore > existingScore) {
          userBestMap.set(perf.userId, perf);
        }
      }

      const leaderboard = Array.from(userBestMap.values())
        .map(p => {
          const userData = allUsersData.find(u => u.id === p.userId);
          return {
            userId: p.userId,
            userName: userData?.name || p.userName,
            avatar: userData?.avatar,
            weight: p.weight,
            reps: p.reps,
            totalVolume: p.weight * p.reps,
            timestamp: p.timestamp,
            rank: 0,
          };
        })
        .sort((a, b) => b.totalVolume - a.totalVolume)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      return leaderboard;
    },
    [exercisePerformances, filterByTime, allUsersData]
  );

  const getGlobalLeaderboard = useCallback(
    (timeFilter: TimeFilter = 'all-time'): GlobalLeaderboardEntry[] => {
      const allRankData = getAllUsersRankData();

      const leaderboard = allRankData
        .map(data => {
          const userData = allUsersData.find(u => u.id === data.userId);
          const userName = userData?.name || userData?.email?.split('@')[0] || (exercisePerformances || []).find(p => p.userId === data.userId)?.userName || 'Unknown';
          return {
            userId: data.userId,
            userName,
            avatar: userData?.avatar,
            rankScore: data.rankScore,
            totalVolume: data.totalVolume,
            workoutsLogged: data.workoutsLogged,
            militaryRank: data.rank,
            rank: 0,
          };
        })
        .sort((a, b) => b.rankScore - a.rankScore)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      return leaderboard;
    },
    [getAllUsersRankData, exercisePerformances, allUsersData]
  );

  const getUserRankForExercise = useCallback(
    (exerciseName: string, timeFilter: TimeFilter = 'all-time'): number => {
      if (!user) return 0;
      
      const leaderboard = getExerciseLeaderboard(exerciseName, timeFilter);
      const userEntry = leaderboard.find(e => e.userId === user.id);
      return userEntry?.rank ?? 0;
    },
    [user, getExerciseLeaderboard]
  );

  const getAllExerciseNames = useCallback((): string[] => {
    const uniqueNames = new Set<string>();
    for (const perf of (exercisePerformances || [])) {
      uniqueNames.add(perf.exerciseName);
    }
    return Array.from(uniqueNames).sort();
  }, [exercisePerformances]);

  const getTopPerformersForExercise = useCallback(
    (exerciseName: string, limit: number = 10, timeFilter: TimeFilter = 'all-time'): ExerciseLeaderboardEntry[] => {
      const leaderboard = getExerciseLeaderboard(exerciseName, timeFilter);
      return leaderboard.slice(0, limit);
    },
    [getExerciseLeaderboard]
  );

  const getTopGlobalPerformers = useCallback(
    (limit: number = 10, timeFilter: TimeFilter = 'all-time'): GlobalLeaderboardEntry[] => {
      const leaderboard = getGlobalLeaderboard(timeFilter);
      return leaderboard.slice(0, limit);
    },
    [getGlobalLeaderboard]
  );

  const getUserPosition = useCallback(
    (exerciseName?: string, timeFilter: TimeFilter = 'all-time'): {
      rank: number;
      totalUsers: number;
      percentile: number;
    } => {
      if (!user) return { rank: 0, totalUsers: 0, percentile: 0 };

      if (exerciseName) {
        const leaderboard = getExerciseLeaderboard(exerciseName, timeFilter);
        const userEntry = leaderboard.find(e => e.userId === user.id);
        const rank = userEntry?.rank ?? 0;
        const totalUsers = leaderboard.length;
        const percentile = totalUsers > 0 ? ((totalUsers - rank + 1) / totalUsers) * 100 : 0;
        return { rank, totalUsers, percentile };
      } else {
        const leaderboard = getGlobalLeaderboard(timeFilter);
        const userEntry = leaderboard.find(e => e.userId === user.id);
        const rank = userEntry?.rank ?? 0;
        const totalUsers = leaderboard.length;
        const percentile = totalUsers > 0 ? ((totalUsers - rank + 1) / totalUsers) * 100 : 0;
        return { rank, totalUsers, percentile };
      }
    },
    [user, getExerciseLeaderboard, getGlobalLeaderboard]
  );

  const getPersonalBest = useCallback(
    (exerciseName: string): { weight: number; reps: number; timestamp: string } | null => {
      if (!user) return null;

      const userPerformances = (exercisePerformances || []).filter(
        p => p.userId === user.id && p.exerciseName === exerciseName
      );

      if (userPerformances.length === 0) return null;

      const best = userPerformances.reduce((prev, curr) => {
        const prevScore = prev.weight * prev.reps;
        const currScore = curr.weight * curr.reps;
        return currScore > prevScore ? curr : prev;
      });

      return {
        weight: best.weight,
        reps: best.reps,
        timestamp: best.timestamp,
      };
    },
    [user, exercisePerformances]
  );

  return useMemo(
    () => ({
      getExerciseLeaderboard,
      getGlobalLeaderboard,
      getUserRankForExercise,
      getAllExerciseNames,
      getTopPerformersForExercise,
      getTopGlobalPerformers,
      getUserPosition,
      getPersonalBest,
    }),
    [
      getExerciseLeaderboard,
      getGlobalLeaderboard,
      getUserRankForExercise,
      getAllExerciseNames,
      getTopPerformersForExercise,
      getTopGlobalPerformers,
      getUserPosition,
      getPersonalBest,
    ]
  );
});

export type LeaderboardContextType = ReturnType<typeof useLeaderboard>;
