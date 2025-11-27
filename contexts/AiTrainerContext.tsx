import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from './AppContext';
import { useTraining } from './TrainingContext';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface UserBehaviorData {
  workouts: {
    totalCompleted: number;
    recentWorkouts: {
      name: string;
      muscleGroup: string;
      date: string;
    }[];
    favoriteExercises: string[];
  };
  meals: {
    totalLogged: number;
    averageCalories: number;
    averageProtein: number;
    recentMeals: {
      name: string;
      calories: number;
      protein: number;
      date: string;
    }[];
  };
  hydration: {
    currentMl: number;
    targetMl: number;
    weeklyAverage: number;
  };
  goals: {
    primaryGoal?: string;
    targetWeight?: string;
    currentWeight?: string;
  };
  iceBaths: {
    total: number;
    averageDuration: number;
  };
  streak: number;
  powerLevel: number;
}

const STORAGE_KEY = 'wf_ai_trainer_messages';

export const [AiTrainerProvider, useAiTrainer] = createContextHook(() => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user, meals, hydrationMl, hydrationTargetMl, streak, powerLevel, iceBaths } = useApp();
  const { workoutLogs, exercisePerformances, activeProgram } = useTraining();

  const loadMessages = useCallback(async () => {
    if (!user) return;
    try {
      const stored = await AsyncStorage.getItem(`${STORAGE_KEY}_${user.id}`);
      if (stored) {
        setMessages(JSON.parse(stored));
      }
    } catch (error) {
      console.error('[AiTrainer] Error loading messages:', error);
    }
  }, [user]);

  const saveMessages = useCallback(async (msgs: Message[]) => {
    if (!user) return;
    try {
      await AsyncStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(msgs));
    } catch (error) {
      console.error('[AiTrainer] Error saving messages:', error);
    }
  }, [user]);

  const getUserBehaviorData = useCallback((): UserBehaviorData => {
    const recentWorkouts = workoutLogs
      .slice(0, 10)
      .map(log => ({
        name: log.workoutName,
        muscleGroup: log.exercises[0]?.exerciseName ?? 'Unknown',
        date: log.completedAt,
      }));

    const exerciseCounts = exercisePerformances.reduce((acc, perf) => {
      acc[perf.exerciseName] = (acc[perf.exerciseName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const favoriteExercises = Object.entries(exerciseCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    const recentMeals = meals.slice(0, 10).map(meal => ({
      name: meal.name,
      calories: meal.calories,
      protein: meal.protein,
      date: meal.loggedAt,
    }));

    const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0);
    const totalProtein = meals.reduce((sum, m) => sum + m.protein, 0);
    const averageCalories = meals.length > 0 ? Math.round(totalCalories / meals.length) : 0;
    const averageProtein = meals.length > 0 ? Math.round(totalProtein / meals.length) : 0;

    const totalIceBathDuration = iceBaths.reduce((sum, ib) => sum + ib.durationMin, 0);
    const averageIceBathDuration = iceBaths.length > 0 ? Math.round(totalIceBathDuration / iceBaths.length) : 0;

    return {
      workouts: {
        totalCompleted: workoutLogs.length,
        recentWorkouts,
        favoriteExercises,
      },
      meals: {
        totalLogged: meals.length,
        averageCalories,
        averageProtein,
        recentMeals,
      },
      hydration: {
        currentMl: hydrationMl,
        targetMl: hydrationTargetMl,
        weeklyAverage: hydrationTargetMl * 0.85,
      },
      goals: {
        primaryGoal: user?.goal,
        targetWeight: user?.weight,
        currentWeight: user?.weight,
      },
      iceBaths: {
        total: iceBaths.length,
        averageDuration: averageIceBathDuration,
      },
      streak,
      powerLevel,
    };
  }, [workoutLogs, exercisePerformances, meals, hydrationMl, hydrationTargetMl, iceBaths, streak, powerLevel, user]);

  const sendMessage = useCallback(async (content: string) => {
    if (!user) {
      throw new Error('User not logged in');
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    await saveMessages(updatedMessages);

    setIsLoading(true);

    try {
      const behaviorData = getUserBehaviorData();
      
      const systemPrompt = `You are a world-class AI fitness trainer for Warfare Fitness. Your role is to provide personalized training advice, motivation, and workout recommendations based on the user's specific behavior and progress.

User Profile:
- Name: ${user.name}
- Goal: ${behaviorData.goals.primaryGoal ?? 'Not specified'}
- Current Weight: ${behaviorData.goals.currentWeight ?? 'Not specified'}
- Target Weight: ${behaviorData.goals.targetWeight ?? 'Not specified'}

User Activity Summary:
- Total Workouts Completed: ${behaviorData.workouts.totalCompleted}
- Current Streak: ${behaviorData.streak} days
- Power Level: ${behaviorData.powerLevel}
- Total Meals Logged: ${behaviorData.meals.totalLogged}
- Average Daily Calories: ${behaviorData.meals.averageCalories}
- Average Daily Protein: ${behaviorData.meals.averageProtein}g
- Current Hydration: ${behaviorData.hydration.currentMl}ml / ${behaviorData.hydration.targetMl}ml
- Ice Baths Completed: ${behaviorData.iceBaths.total}
- Favorite Exercises: ${behaviorData.workouts.favoriteExercises.join(', ') || 'None yet'}

Recent Workouts:
${behaviorData.workouts.recentWorkouts.slice(0, 3).map(w => `- ${w.name} (${new Date(w.date).toLocaleDateString()})`).join('\n') || 'No recent workouts'}

Recent Meals:
${behaviorData.meals.recentMeals.slice(0, 3).map(m => `- ${m.name}: ${m.calories} cal, ${m.protein}g protein (${new Date(m.date).toLocaleDateString()})`).join('\n') || 'No recent meals'}

Current Program: ${activeProgram?.title ?? 'No active program'}

Your responses should be:
1. Personalized based on their activity and progress
2. Motivational and encouraging
3. Specific and actionable
4. Based on exercise science principles
5. Consider their goals, past performance, and current habits

Use military-style motivation when appropriate but also be empathetic and supportive. Help them overcome plateaus, suggest improvements, and celebrate their victories.`;

      const conversationHistory = updatedMessages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_KEY || 'sk-proj-'}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
          ],
          temperature: 0.8,
          max_tokens: 800,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content ?? 'Sorry, I could not generate a response.';

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await saveMessages(finalMessages);
    } catch (error) {
      console.error('[AiTrainer] Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again later.',
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...updatedMessages, errorMessage];
      setMessages(finalMessages);
      await saveMessages(finalMessages);
    } finally {
      setIsLoading(false);
    }
  }, [user, messages, getUserBehaviorData, saveMessages, activeProgram]);

  const clearChat = useCallback(async () => {
    setMessages([]);
    if (user) {
      await AsyncStorage.removeItem(`${STORAGE_KEY}_${user.id}`);
    }
  }, [user]);

  return useMemo(() => ({
    messages,
    isLoading,
    sendMessage,
    clearChat,
    loadMessages,
    getUserBehaviorData,
  }), [messages, isLoading, sendMessage, clearChat, loadMessages, getUserBehaviorData]);
});
