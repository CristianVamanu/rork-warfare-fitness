import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/contexts/AppContext';

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSec: number;
  rpe?: string;
  imageUrl?: string;
  isCardio?: boolean;
  cardioDurationMin?: number;
};

export type ExercisePerformance = {
  exerciseName: string;
  weight: number;
  reps: number;
  timestamp: string;
  userId: string;
  userName: string;
};

export type WorkoutLog = {
  id: string;
  programId: string;
  day: number;
  workoutName: string;
  completedAt: string;
  exercises: {
    exerciseId: string;
    exerciseName: string;
    sets: { weight: number; reps: number; completed: boolean }[];
  }[];
  calories: number;
  duration: number;
  notes?: string;
};

export type ExerciseRanking = {
  exerciseName: string;
  userRank: number;
  totalUsers: number;
  personalBest: { weight: number; reps: number; timestamp: string } | null;
  topPerformers: { userId: string; userName: string; weight: number; reps: number; rank: number }[];
};

export type Achievement = {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  type: 'pr' | 'streak' | 'milestone' | 'level';
  title: string;
  description: string;
  timestamp: string;
  exerciseName?: string;
  weight?: number;
  reps?: number;
};

export type Workout = {
  id: string;
  name: string;
  durationMin: number;
  muscleGroup: string;
  exercises: Exercise[];
};

export type Program = {
  id: string;
  title: string;
  description?: string;
  logoUrl?: string;
  days: number;
  startDate?: string;
  trialStartDate?: string;
  schedule: { day: number; workout: Workout | null }[];
  completedDays: Record<number, boolean>;
  accessLevel?: 'free' | 'premium';
  isPaid?: boolean;
  requiresSubscription?: boolean;
};

const STORAGE_KEYS = {
  PROGRAMS: 'wf_programs',
  ACTIVE_ID: 'wf_active_program_id',
  WORKOUT_LOGS: 'wf_workout_logs',
  EXERCISE_PERFORMANCES: 'wf_exercise_performances',
  ACHIEVEMENTS: 'wf_achievements',
};

function generateWorkout(idSeed: string, name: string, muscleGroup: string): Workout {
  const id = `${idSeed}-${name.replace(/\s+/g, '-')}`;
  return {
    id,
    name,
    durationMin: 45,
    muscleGroup,
    exercises: [
      { id: `${id}-1`, name: 'Warm-up Jog', sets: 1, reps: '8 min', restSec: 60 },
      { id: `${id}-2`, name: `${muscleGroup} Compound`, sets: 4, reps: '8-10', restSec: 90 },
      { id: `${id}-3`, name: `${muscleGroup} Accessory`, sets: 3, reps: '12-15', restSec: 60 },
      { id: `${id}-4`, name: 'Core Finisher', sets: 3, reps: 'AMRAP 45s', restSec: 45 },
    ],
  };
}

function build90DaySchedule(programId: string, variant: 'strength'|'conditioning'|'hypertrophy'|'fatloss'|'calisthenics'): { day: number; workout: Workout | null }[] {
  const blocks: { name: string; group: string; isRest?: boolean }[] = [
    { name: 'Upper Power', group: 'Upper' },
    { name: 'Lower Power', group: 'Lower' },
    { name: 'Conditioning Intervals', group: 'Cardio' },
    { name: 'Hypertrophy Push', group: 'Chest/Triceps' },
    { name: 'Hypertrophy Pull', group: 'Back/Biceps' },
    { name: 'Mobility + Core', group: 'Mobility' },
    { name: 'Rest Day', group: 'Rest', isRest: true },
  ];
  const schedule: { day: number; workout: Workout | null }[] = [];
  for (let d = 1; d <= 90; d++) {
    const block = blocks[(d - 1) % blocks.length];
    if (block.isRest) {
      schedule.push({ day: d, workout: null });
    } else {
      const workout = generateWorkout(programId + '-' + d, `${block.name}`, block.group);
      schedule.push({ day: d, workout });
    }
  }
  return schedule;
}

const DEFAULT_PROGRAMS: Program[] = [
  { id: 'lean-muscle-90', title: 'Lean Muscle 90', days: 90, schedule: build90DaySchedule('lean-muscle-90', 'hypertrophy'), completedDays: {}, accessLevel: 'free', isPaid: false, requiresSubscription: false },
  { id: 'anxiety-killer-90', title: 'Anxiety Killer 90', days: 90, schedule: build90DaySchedule('anxiety-killer-90', 'conditioning'), completedDays: {}, accessLevel: 'free', isPaid: false, requiresSubscription: false },
  { id: 'alpha-bulk-90', title: 'Alpha Bulk 90', days: 90, schedule: build90DaySchedule('alpha-bulk-90', 'hypertrophy'), completedDays: {}, accessLevel: 'free', isPaid: false, requiresSubscription: false },
  { id: 'burn-ops-90', title: 'Burn Ops 90', days: 90, schedule: build90DaySchedule('burn-ops-90', 'fatloss'), completedDays: {}, accessLevel: 'free', isPaid: false, requiresSubscription: false },
  { id: 'calisthenics-warfare-90', title: 'Calisthenics Warfare 90', days: 90, schedule: build90DaySchedule('calisthenics-warfare-90', 'calisthenics'), completedDays: {}, accessLevel: 'free', isPaid: false, requiresSubscription: false },
];

export type SubscriptionTier = 'free' | 'premium';

export const [TrainingProvider, useTraining] = createContextHook(() => {
  const [programs, setPrograms] = useState<Program[]>(DEFAULT_PROGRAMS);
  const [activeProgramId, setActiveProgramId] = useState<string | undefined>(undefined);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [exercisePerformances, setExercisePerformances] = useState<ExercisePerformance[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const { user, subscriptionTier, isLoading: appIsLoading, adminSettings: appSettings, hasFullAccess } = useApp();

  useEffect(() => {
    if (appIsLoading) return;
    
    async function loadPersistedData() {
      try {
        console.log('[TrainingContext] Loading persisted data...');
        
        const storedPrograms = await AsyncStorage.getItem(STORAGE_KEYS.PROGRAMS);
        if (storedPrograms) {
          try {
            setPrograms(JSON.parse(storedPrograms));
            console.log('[TrainingContext] Programs loaded from storage');
          } catch (err) {
            console.error('[TrainingContext] Failed to parse programs:', err);
          }
        }
        
        const storedActiveId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
        if (storedActiveId) {
          setActiveProgramId(storedActiveId);
          console.log('[TrainingContext] Active program loaded:', storedActiveId);
        }
        
        const storedLogs = await AsyncStorage.getItem(STORAGE_KEYS.WORKOUT_LOGS);
        if (storedLogs) {
          try {
            setWorkoutLogs(JSON.parse(storedLogs));
            console.log('[TrainingContext] Workout logs loaded');
          } catch (err) {
            console.error('[TrainingContext] Failed to parse workout logs:', err);
          }
        }
        
        const storedPerformances = await AsyncStorage.getItem(STORAGE_KEYS.EXERCISE_PERFORMANCES);
        if (storedPerformances) {
          try {
            setExercisePerformances(JSON.parse(storedPerformances));
            console.log('[TrainingContext] Exercise performances loaded');
          } catch (err) {
            console.error('[TrainingContext] Failed to parse exercise performances:', err);
          }
        }
        
        const storedAchievements = await AsyncStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
        if (storedAchievements) {
          try {
            setAchievements(JSON.parse(storedAchievements));
            console.log('[TrainingContext] Achievements loaded');
          } catch (err) {
            console.error('[TrainingContext] Failed to parse achievements:', err);
          }
        }
        
        console.log('[TrainingContext] All training data loaded successfully');
      } catch (error) {
        console.error('[TrainingContext] Error loading persisted data:', error);
      } finally {
        setIsInitialized(true);
      }
    }
    
    void loadPersistedData();
  }, [appIsLoading]);

  const persist = useCallback(async (nextPrograms: Program[], nextActive?: string) => {
    try {
      console.log('[Training] Persisting programs to AsyncStorage...');
      await AsyncStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(nextPrograms));
      if (nextActive !== undefined) {
        await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_ID, nextActive);
      }
      console.log('[Training] ✅ Programs persisted successfully');
    } catch (e) {
      console.error('[Training] ❌ Error persisting programs:', e);
    }
  }, []);

  const enroll = useCallback((programId: string) => {
    console.log('[Training] enroll', programId);
    const today = new Date();
    const iso = today.toISOString();
    const next = programs.map(p => {
      if (p.id !== programId) return p;
      const updates: Partial<Program> = { startDate: iso };
      if (p.isPaid && p.requiresSubscription) {
        updates.trialStartDate = iso;
      }
      return { ...p, ...updates };
    });
    setPrograms(next);
    setActiveProgramId(programId);
    void persist(next, programId);
  }, [programs, persist]);

  const unenroll = useCallback(() => {
    setActiveProgramId(undefined);
    void AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_ID);
  }, []);

  const markDayComplete = useCallback(async (programId: string, day: number) => {
    console.log('[Training] ===== MARKING DAY COMPLETE =====');
    console.log('[Training] Program ID:', programId, 'Day:', day);
    const next = programs.map(p => {
      if (p.id !== programId) return p;
      const updated = { ...p, completedDays: { ...p.completedDays, [day]: true } };
      console.log('[Training] Updated completedDays for program', p.id, ':', updated.completedDays);
      return updated;
    });
    setPrograms(next);
    await persist(next);
    console.log('[Training] ✅ Day marked complete and persisted');
    console.log('[Training] ===== MARK DAY COMPLETE END =====');
  }, [programs, persist]);

  const activeProgram = useMemo(() => programs.find(p => p.id === activeProgramId), [programs, activeProgramId]);

  const isTrialExpired = useCallback((program: Program) => {
    return !hasFullAccess();
  }, [hasFullAccess]);

  const hasAccessToDay = useCallback((program: Program, day: number) => {
    console.log('[Training] ===== ACCESS CHECK START =====');
    console.log('[Training] Day:', day);
    console.log('[Training] subscriptionTier:', subscriptionTier);
    
    if (subscriptionTier === 'premium') {
      console.log('[Training] Premium user - full access');
      console.log('[Training] ===== ACCESS CHECK END =====');
      return true;
    }
    
    const inFreeTrial = hasFullAccess();
    if (inFreeTrial) {
      const freeTrialDays = appSettings.subscriptionPrices?.freeTrialDays ?? 7;
      console.log('[Training] User in free trial - access to first', freeTrialDays, 'days');
      const hasAccess = day <= freeTrialDays;
      console.log('[Training] Day', day, 'access:', hasAccess);
      console.log('[Training] ===== ACCESS CHECK END =====');
      return hasAccess;
    }
    
    console.log('[Training] Free trial expired - no access');
    console.log('[Training] ===== ACCESS CHECK END =====');
    return false;
  }, [subscriptionTier, appSettings, hasFullAccess]);

  const hasAccessToProgram = useCallback((program: Program) => {
    console.log('[Training] ===== PROGRAM ACCESS CHECK START =====');
    console.log('[Training] subscriptionTier:', subscriptionTier);
    
    const fullAccess = hasFullAccess();
    console.log('[Training] hasFullAccess:', fullAccess);
    console.log('[Training] ===== PROGRAM ACCESS CHECK END =====');
    return fullAccess;
  }, [subscriptionTier, hasFullAccess]);

  const getOverallProgress = useCallback(() => {
    const p = activeProgram;
    if (!p || !p.startDate) return { day: 0, total: 90 };
    
    const completedDaysArray = Object.keys(p.completedDays)
      .filter(key => p.completedDays[parseInt(key, 10)] === true)
      .map(key => parseInt(key, 10))
      .sort((a, b) => a - b);
    
    const lastCompletedDay = completedDaysArray.length > 0 
      ? Math.max(...completedDaysArray) 
      : 0;
    
    const currentDay = lastCompletedDay + 1;
    
    const start = new Date(p.startDate);
    const now = new Date();
    const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    let effectiveDay = Math.max(currentDay, Math.min(daysSinceStart, currentDay));
    effectiveDay = Math.min(effectiveDay, p.days);
    effectiveDay = Math.max(1, effectiveDay);
    
    const hasAccess = hasAccessToProgram(p);
    if (!hasAccess) {
      effectiveDay = Math.min(effectiveDay, 7);
    }
    
    console.log('[Training] getOverallProgress:', {
      lastCompletedDay,
      currentDay,
      daysSinceStart,
      effectiveDay,
      completedDaysCount: completedDaysArray.length
    });
    
    return { day: effectiveDay, total: p.days };
  }, [activeProgram, hasAccessToProgram]);

  const getUpcomingWorkouts = useCallback((limit: number = 7) => {
    const p = activeProgram;
    if (!p) return [] as { day: number; workout: Workout; date: string }[];
    const { day } = getOverallProgress();
    const out: { day: number; workout: Workout; date: string }[] = [];
    for (let i = 0; i < limit; i++) {
      const d = day + i;
      if (d > p.days) break;
      const entry = p.schedule.find(s => s.day === d);
      if (!entry || !entry.workout) continue;
      const date = new Date();
      date.setDate(date.getDate() + i);
      out.push({ day: d, workout: entry.workout, date: date.toISOString() });
    }
    return out;
  }, [activeProgram, getOverallProgress]);

  const getDayWorkout = useCallback((programId: string, day: number) => {
    const p = programs.find(pr => pr.id === programId);
    return p?.schedule.find(s => s.day === day)?.workout;
  }, [programs]);

  const addDayToProgram = useCallback((programId: string) => {
    const next = programs.map(p => {
      if (p.id !== programId) return p;
      const newDay = p.days + 1;
      const newWorkout = generateWorkout(p.id + '-' + newDay, `Day ${newDay} Workout`, 'Full Body');
      return {
        ...p,
        days: newDay,
        schedule: [...p.schedule, { day: newDay, workout: newWorkout }],
      };
    });
    setPrograms(next);
    void persist(next);
  }, [programs, persist]);

  const removeDayFromProgram = useCallback((programId: string, day: number) => {
    const next = programs.map(p => {
      if (p.id !== programId) return p;
      const schedule = p.schedule.filter(s => s.day !== day).map((s, idx) => ({ ...s, day: idx + 1 }));
      return { ...p, days: schedule.length, schedule };
    });
    setPrograms(next);
    void persist(next);
  }, [programs, persist]);

  const cloneWeek = useCallback((programId: string, weekNumber: number) => {
    const next = programs.map(p => {
      if (p.id !== programId) return p;
      const startDay = (weekNumber - 1) * 7 + 1;
      const endDay = startDay + 6;
      const weekSchedule = p.schedule.filter(s => s.day >= startDay && s.day <= endDay);
      if (weekSchedule.length === 0) return p;
      const newSchedule = [...p.schedule];
      const currentMaxDay = p.days;
      weekSchedule.forEach((s, idx) => {
        const newDay = currentMaxDay + idx + 1;
        const clonedWorkout = s.workout ? {
          ...s.workout,
          id: `${p.id}-${newDay}-${Date.now()}`,
        } : null;
        newSchedule.push({ day: newDay, workout: clonedWorkout });
      });
      return { ...p, days: p.days + weekSchedule.length, schedule: newSchedule };
    });
    setPrograms(next);
    void persist(next);
  }, [programs, persist]);

  const createProgram = useCallback((title: string, days: number = 90, accessLevel: Program['accessLevel'] = 'free', isPaid: boolean = false) => {
    const id = title.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const schedule: { day: number; workout: Workout | null }[] = [];
    for (let d = 1; d <= days; d++) {
      schedule.push({ day: d, workout: generateWorkout(id + '-' + d, `Day ${d} Workout`, 'Full Body') });
    }
    const program: Program = { id, title, days, schedule, completedDays: {}, accessLevel, isPaid, requiresSubscription: isPaid };
    const next = [program, ...programs];
    setPrograms(next);
    void persist(next);
    return id;
  }, [programs, persist]);

  const deleteProgram = useCallback(async (programId: string) => {
    try {
      console.log('[Training] Deleting program:', programId);
      const next = programs.filter(p => p.id !== programId);
      setPrograms(next);
      await AsyncStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(next));
      if (activeProgramId === programId) {
        setActiveProgramId(undefined);
        await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_ID);
      }
      console.log('[Training] Program deleted successfully:', programId);
    } catch (error) {
      console.error('[Training] Failed to delete program:', error);
      throw error;
    }
  }, [programs, activeProgramId]);

  const updateProgramMeta = useCallback((programId: string, updates: Partial<Pick<Program, 'title' | 'description' | 'days' | 'isPaid' | 'requiresSubscription' | 'logoUrl'>>) => {
    const next = programs.map(p => p.id === programId ? { ...p, ...updates } : p);
    setPrograms(next);
    void persist(next);
  }, [programs, persist]);

  const setWorkoutForDay = useCallback((programId: string, day: number, workout: Workout | null) => {
    const next = programs.map(p => {
      if (p.id !== programId) return p;
      const idx = p.schedule.findIndex(s => s.day === day);
      let schedule = [...p.schedule];
      if (idx >= 0) {
        schedule[idx] = { day, workout };
      } else {
        schedule.push({ day, workout });
        schedule.sort((a, b) => a.day - b.day);
      }
      return { ...p, schedule };
    });
    setPrograms(next);
    void persist(next);
  }, [programs, persist]);

  const updateProgramAccess = useCallback((programId: string, accessLevel: Program['accessLevel']) => {
    const next = programs.map(p => p.id === programId ? { ...p, accessLevel } : p);
    setPrograms(next);
    void persist(next);
  }, [programs, persist]);

  const logWorkout = useCallback(async (log: Omit<WorkoutLog, 'id'>) => {
    const newLog: WorkoutLog = { ...log, id: Date.now().toString() };
    const next = [newLog, ...workoutLogs];
    setWorkoutLogs(next);
    await AsyncStorage.setItem(STORAGE_KEYS.WORKOUT_LOGS, JSON.stringify(next));

    const newPerformances: ExercisePerformance[] = [];
    const flaggedPerformances: { exerciseName: string; weight: number; reps: number; reason: string }[] = [];

    for (const ex of log.exercises) {
      for (const set of ex.sets) {
        if (set.completed && set.weight > 0 && set.reps > 0) {
          const userWeight = parseFloat(user?.weight ?? '180');
          const bodyweightMultiplier = 3.5;
          const maxReasonableWeight = userWeight * bodyweightMultiplier;

          if (set.weight > maxReasonableWeight) {
            console.warn(
              '[Training] 🚨 ANTI-CHEAT: Impossible lift detected!',
              `${ex.exerciseName}: ${set.weight}lbs × ${set.reps}`,
              `User weight: ${userWeight}lbs, Max reasonable: ${maxReasonableWeight}lbs`
            );
            flaggedPerformances.push({
              exerciseName: ex.exerciseName,
              weight: set.weight,
              reps: set.reps,
              reason: `Exceeds ${bodyweightMultiplier}x bodyweight (${userWeight}lbs)`,
            });
            continue;
          }

          newPerformances.push({
            exerciseName: ex.exerciseName,
            weight: set.weight,
            reps: set.reps,
            timestamp: log.completedAt,
            userId: user?.id ?? 'guest',
            userName: user?.name || user?.email?.split('@')[0] || 'Guest',
          });
        }
      }
    }

    if (flaggedPerformances.length > 0) {
      console.log('[Training] Flagged performances:', flaggedPerformances);
    }

    if (newPerformances.length > 0) {
      const allPerformances = [...exercisePerformances, ...newPerformances];
      setExercisePerformances(allPerformances);
      await AsyncStorage.setItem(STORAGE_KEYS.EXERCISE_PERFORMANCES, JSON.stringify(allPerformances));

      for (const perf of newPerformances) {
        const prevBest = exercisePerformances
          .filter(p => p.exerciseName === perf.exerciseName && p.userId === perf.userId)
          .sort((a, b) => (b.weight * b.reps) - (a.weight * a.reps))[0];
        
        const currentScore = perf.weight * perf.reps;
        const prevScore = prevBest ? prevBest.weight * prevBest.reps : 0;

        if (currentScore > prevScore) {
          const achievement: Achievement = {
            id: Date.now().toString() + Math.random(),
            userId: user?.id ?? 'guest',
            userName: user?.name || user?.email?.split('@')[0] || 'Guest',
            userAvatar: user?.avatar,
            type: 'pr',
            title: 'New Personal Record!',
            description: `${perf.exerciseName}: ${perf.weight}lbs × ${perf.reps} reps`,
            timestamp: perf.timestamp,
            exerciseName: perf.exerciseName,
            weight: perf.weight,
            reps: perf.reps,
          };
          const nextAchievements = [achievement, ...achievements];
          setAchievements(nextAchievements);
          await AsyncStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(nextAchievements));
        }
      }
    }

    console.log('[Training] Workout logged:', log.workoutName);
  }, [workoutLogs, exercisePerformances, achievements, user]);

  const getExerciseRankings = useCallback((exerciseName: string): ExerciseRanking => {
    const allPerfs = exercisePerformances.filter(p => p.exerciseName === exerciseName);
    
    const userPerfs = allPerfs.filter(p => p.userId === (user?.id ?? 'guest'));
    const personalBest = userPerfs.length > 0
      ? userPerfs.reduce((best, curr) => {
          const currScore = curr.weight * curr.reps;
          const bestScore = best.weight * best.reps;
          return currScore > bestScore ? curr : best;
        })
      : null;

    const userBestScores = new Map<string, { user: ExercisePerformance; score: number }>();
    for (const perf of allPerfs) {
      const score = perf.weight * perf.reps;
      const existing = userBestScores.get(perf.userId);
      if (!existing || score > existing.score) {
        userBestScores.set(perf.userId, { user: perf, score });
      }
    }

    const sortedUsers = Array.from(userBestScores.values())
      .sort((a, b) => b.score - a.score);

    const userRank = sortedUsers.findIndex(u => u.user.userId === (user?.id ?? 'guest')) + 1;

    const topPerformers = sortedUsers.slice(0, 10).map((u, idx) => ({
      userId: u.user.userId,
      userName: u.user.userName,
      weight: u.user.weight,
      reps: u.user.reps,
      rank: idx + 1,
    }));

    return {
      exerciseName,
      userRank: userRank || 0,
      totalUsers: userBestScores.size,
      personalBest: personalBest ? { weight: personalBest.weight, reps: personalBest.reps, timestamp: personalBest.timestamp } : null,
      topPerformers,
    };
  }, [exercisePerformances, user]);

  const getAllUniqueExercises = useCallback((): string[] => {
    const uniqueNames = new Set<string>();
    for (const perf of exercisePerformances) {
      uniqueNames.add(perf.exerciseName);
    }
    return Array.from(uniqueNames).sort();
  }, [exercisePerformances]);

  const getRecentAchievements = useCallback((limit: number = 20) => {
    return achievements.slice(0, limit);
  }, [achievements]);

  const resetTrainingData = useCallback(async () => {
    console.log('[Training] Resetting all training data for new user');
    const freshPrograms = DEFAULT_PROGRAMS.map(p => ({
      ...p,
      completedDays: {},
      startDate: undefined,
      trialStartDate: undefined,
    }));
    setPrograms(freshPrograms);
    setActiveProgramId(undefined);
    setWorkoutLogs([]);
    setExercisePerformances([]);
    setAchievements([]);
    setIsInitialized(false);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.PROGRAMS, JSON.stringify(freshPrograms)),
      AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_ID),
      AsyncStorage.setItem(STORAGE_KEYS.WORKOUT_LOGS, JSON.stringify([])),
      AsyncStorage.setItem(STORAGE_KEYS.EXERCISE_PERFORMANCES, JSON.stringify([])),
      AsyncStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify([])),
    ]);
    console.log('[Training] Data reset complete. Workout logs: 0, Programs reset, isInitialized reset to false');
    setIsInitialized(true);
  }, []);

  return useMemo(() => ({
    programs,
    activeProgram,
    activeProgramId,
    enroll,
    unenroll,
    markDayComplete,
    getOverallProgress,
    getUpcomingWorkouts,
    getDayWorkout,
    createProgram,
    deleteProgram,
    updateProgramMeta,
    setWorkoutForDay,
    updateProgramAccess,
    workoutLogs,
    exercisePerformances,
    achievements,
    logWorkout,
    getExerciseRankings,
    getAllUniqueExercises,
    getRecentAchievements,
    addDayToProgram,
    removeDayFromProgram,
    cloneWeek,
    isTrialExpired,
    hasAccessToProgram,
    hasAccessToDay,
    resetTrainingData,
  }), [programs, activeProgram, activeProgramId, enroll, unenroll, markDayComplete, getOverallProgress, getUpcomingWorkouts, getDayWorkout, createProgram, deleteProgram, updateProgramMeta, setWorkoutForDay, updateProgramAccess, workoutLogs, exercisePerformances, achievements, logWorkout, getExerciseRankings, getAllUniqueExercises, getRecentAchievements, addDayToProgram, removeDayFromProgram, cloneWeek, isTrialExpired, hasAccessToProgram, hasAccessToDay, resetTrainingData]);
});
