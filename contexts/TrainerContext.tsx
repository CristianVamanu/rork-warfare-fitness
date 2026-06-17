import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/contexts/AppContext';

export type TrainerProgram = {
  id: string;
  trainerId: string;
  trainerName: string;
  trainerAvatar?: string;
  trainerBio?: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  price: number;
  trialDays: number;
  category: 'strength' | 'cardio' | 'hiit' | 'calisthenics' | 'yoga' | 'mobility' | 'powerlifting' | 'bodybuilding';
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  durationWeeks: number;
  workoutsPerWeek: number;
  totalEnrolled: number;
  rating: number;
  reviewCount: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  schedule: TrainerWorkoutDay[];
  tags: string[];
};

export type TrainerWorkoutDay = {
  day: number;
  weekNumber: number;
  workoutName: string;
  muscleGroups: string[];
  isRestDay: boolean;
  exercises: TrainerExercise[];
  durationMin: number;
};

export type TrainerExercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSec: number;
  notes?: string;
  videoUrl?: string;
  imageUrl?: string;
  isCardio?: boolean;
  cardioDurationMin?: number;
};

export type UserProgramAccess = {
  userId: string;
  programId: string;
  trialStartDate: string;
  trialEndDate: string;
  isPaid: boolean;
  purchasedAt?: string;
  paidAmount?: number;
};

const STORAGE_KEYS = {
  TRAINER_PROGRAMS: 'wf_trainer_programs',
  USER_PROGRAM_ACCESS: 'wf_user_program_access',
};

export const [TrainerProvider, useTrainer] = createContextHook(() => {
  const { user } = useApp();
  const [trainerPrograms, setTrainerPrograms] = useState<TrainerProgram[]>([]);
  const [userProgramAccess, setUserProgramAccess] = useState<UserProgramAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [programsRaw, accessRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.TRAINER_PROGRAMS),
          AsyncStorage.getItem(STORAGE_KEYS.USER_PROGRAM_ACCESS),
        ]);
        if (programsRaw) setTrainerPrograms(JSON.parse(programsRaw));
        if (accessRaw) setUserProgramAccess(JSON.parse(accessRaw));
      } catch (e) {
        console.error('[Trainer] Load error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const savePrograms = useCallback(async (programs: TrainerProgram[]) => {
    setTrainerPrograms(programs);
    await AsyncStorage.setItem(STORAGE_KEYS.TRAINER_PROGRAMS, JSON.stringify(programs));
  }, []);

  const saveAccess = useCallback(async (access: UserProgramAccess[]) => {
    setUserProgramAccess(access);
    await AsyncStorage.setItem(STORAGE_KEYS.USER_PROGRAM_ACCESS, JSON.stringify(access));
  }, []);

  const createProgram = useCallback(async (
    data: Omit<TrainerProgram, 'id' | 'createdAt' | 'updatedAt' | 'totalEnrolled' | 'rating' | 'reviewCount'>
  ): Promise<TrainerProgram> => {
    const program: TrainerProgram = {
      ...data,
      id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      totalEnrolled: 0,
      rating: 0,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await savePrograms([...trainerPrograms, program]);
    return program;
  }, [trainerPrograms, savePrograms]);

  const updateProgram = useCallback(async (id: string, updates: Partial<TrainerProgram>) => {
    const updated = trainerPrograms.map(p =>
      p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
    );
    await savePrograms(updated);
  }, [trainerPrograms, savePrograms]);

  const deleteProgram = useCallback(async (id: string) => {
    await savePrograms(trainerPrograms.filter(p => p.id !== id));
  }, [trainerPrograms, savePrograms]);

  const startTrial = useCallback(async (programId: string, trialDays: number) => {
    if (!user) return;
    const existing = userProgramAccess.find(a => a.userId === user.id && a.programId === programId);
    if (existing) return;
    const now = new Date();
    const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const access: UserProgramAccess = {
      userId: user.id,
      programId,
      trialStartDate: now.toISOString(),
      trialEndDate: trialEnd.toISOString(),
      isPaid: false,
    };
    await saveAccess([...userProgramAccess, access]);
  }, [user, userProgramAccess, saveAccess]);

  const purchaseProgram = useCallback(async (programId: string, amount: number) => {
    if (!user) return;
    const existing = userProgramAccess.find(a => a.userId === user.id && a.programId === programId);
    if (existing) {
      const updated = userProgramAccess.map(a =>
        a.userId === user.id && a.programId === programId
          ? { ...a, isPaid: true, purchasedAt: new Date().toISOString(), paidAmount: amount }
          : a
      );
      await saveAccess(updated);
    } else {
      const access: UserProgramAccess = {
        userId: user.id,
        programId,
        trialStartDate: new Date().toISOString(),
        trialEndDate: new Date().toISOString(),
        isPaid: true,
        purchasedAt: new Date().toISOString(),
        paidAmount: amount,
      };
      await saveAccess([...userProgramAccess, access]);
    }
    const prog = trainerPrograms.find(p => p.id === programId);
    if (prog) {
      await updateProgram(programId, { totalEnrolled: prog.totalEnrolled + 1 });
    }
  }, [user, userProgramAccess, saveAccess, trainerPrograms, updateProgram]);

  const getUserAccess = useCallback((programId: string): {
    hasAccess: boolean;
    isInTrial: boolean;
    trialDaysLeft: number;
    isPaid: boolean;
    trialExpired: boolean;
  } => {
    if (!user) return { hasAccess: false, isInTrial: false, trialDaysLeft: 0, isPaid: false, trialExpired: false };
    const access = userProgramAccess.find(a => a.userId === user.id && a.programId === programId);
    if (!access) return { hasAccess: false, isInTrial: false, trialDaysLeft: 0, isPaid: false, trialExpired: false };
    if (access.isPaid) return { hasAccess: true, isInTrial: false, trialDaysLeft: 0, isPaid: true, trialExpired: false };
    const now = new Date();
    const trialEnd = new Date(access.trialEndDate);
    const msLeft = trialEnd.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    const trialExpired = msLeft <= 0;
    return { hasAccess: !trialExpired, isInTrial: !trialExpired, trialDaysLeft: daysLeft, isPaid: false, trialExpired };
  }, [user, userProgramAccess]);

  const myPrograms = useMemo(() => {
    if (!user) return [];
    return trainerPrograms.filter(p => p.trainerId === user.id);
  }, [trainerPrograms, user]);

  const publishedPrograms = useMemo(() =>
    trainerPrograms.filter(p => p.isPublished),
    [trainerPrograms]
  );

  return useMemo(() => ({
    isLoading,
    trainerPrograms,
    publishedPrograms,
    myPrograms,
    userProgramAccess,
    createProgram,
    updateProgram,
    deleteProgram,
    startTrial,
    purchaseProgram,
    getUserAccess,
  }), [
    isLoading,
    trainerPrograms,
    publishedPrograms,
    myPrograms,
    userProgramAccess,
    createProgram,
    updateProgram,
    deleteProgram,
    startTrial,
    purchaseProgram,
    getUserAccess,
  ]);
});
