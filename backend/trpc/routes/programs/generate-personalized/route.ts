import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { TRPCError } from "@trpc/server";

const exerciseSchema = z.object({
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
  restSec: z.number(),
  rpe: z.string().optional(),
  isCardio: z.boolean().optional(),
  cardioDurationMin: z.number().optional(),
});

const workoutSchema = z.object({
  name: z.string(),
  durationMin: z.number(),
  muscleGroup: z.string(),
  exercises: z.array(exerciseSchema),
});

const dayScheduleSchema = z.object({
  day: z.number(),
  workout: workoutSchema.nullable(),
});

export const generatePersonalizedProgramRoute = publicProcedure
  .input(
    z.object({
      userId: z.string(),
      goal: z.string(),
      userBehaviorData: z.object({
        workouts: z.object({
          totalCompleted: z.number(),
          favoriteExercises: z.array(z.string()),
        }),
        meals: z.object({
          averageCalories: z.number(),
          averageProtein: z.number(),
        }),
        goals: z.object({
          primaryGoal: z.string().optional(),
          currentWeight: z.string().optional(),
          targetWeight: z.string().optional(),
        }),
        streak: z.number(),
        powerLevel: z.number(),
      }),
      days: z.number().optional().default(30),
    })
  )
  .mutation(async ({ input }) => {
    try {
      console.log('[AI Personalized Program] Starting generation for user:', input.userId);

      const { goal, userBehaviorData, days, userId } = input;

      const apiKey = process.env.EXPO_PUBLIC_OPENAI_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'OpenAI API key is not configured.',
        });
      }

      const systemPrompt = `You are an expert fitness program designer creating a PERSONALIZED ${days}-day workout program.

USER PROFILE:
- Goal: ${goal}
- Primary Goal: ${userBehaviorData.goals.primaryGoal ?? 'Not specified'}
- Current Weight: ${userBehaviorData.goals.currentWeight ?? 'Not specified'}
- Target Weight: ${userBehaviorData.goals.targetWeight ?? 'Not specified'}
- Total Workouts Completed: ${userBehaviorData.workouts.totalCompleted}
- Current Streak: ${userBehaviorData.streak} days
- Power Level: ${userBehaviorData.powerLevel}
- Average Daily Calories: ${userBehaviorData.meals.averageCalories}
- Average Daily Protein: ${userBehaviorData.meals.averageProtein}g
- Favorite Exercises: ${userBehaviorData.workouts.favoriteExercises.join(', ') || 'None yet'}

IMPORTANT: Create a program that:
1. Aligns with their stated goal
2. Incorporates their favorite exercises when appropriate
3. Matches their experience level (based on workouts completed)
4. Provides progressive overload
5. Includes proper rest days
6. Considers their nutrition habits for recovery

Return ONLY valid JSON, no markdown, no code blocks:

{
  "title": "Personalized Program Title (mention their goal)",
  "description": "Brief description explaining how this program is tailored to them",
  "days": ${days},
  "schedule": [
    {
      "day": 1,
      "workout": {
        "name": "Workout Name",
        "durationMin": 45,
        "muscleGroup": "Target Muscle Group",
        "exercises": [
          {
            "name": "Exercise Name",
            "sets": 3,
            "reps": "8-12",
            "restSec": 90,
            "rpe": "7-9",
            "isCardio": false
          }
        ]
      }
    }
  ]
}

For cardio exercises, set "isCardio": true and add "cardioDurationMin" instead of reps.
For rest days, use: { "day": X, "workout": null }`;

      const requestBody = {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Create a ${days}-day personalized workout program for me based on my goal: ${goal}`,
          },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      };

      console.log('[AI Personalized Program] Calling OpenAI API...');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI Personalized Program] OpenAI API error:', response.status, errorText);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `OpenAI API error: ${response.status}`,
        });
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'No content received from OpenAI',
        });
      }

      console.log('[AI Personalized Program] Received response from OpenAI');

      let programData;
      try {
        let cleanContent = content.trim();
        
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.replace(/```json\s*/i, '');
        }
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/```\s*/i, '');
        }
        if (cleanContent.endsWith('```')) {
          cleanContent = cleanContent.replace(/\s*```$/i, '');
        }
        
        cleanContent = cleanContent.trim();
        programData = JSON.parse(cleanContent);
      } catch {
        console.error('[AI Personalized Program] Failed to parse JSON:', content);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Invalid JSON response from OpenAI',
        });
      }

      const programResult = z.object({
        title: z.string(),
        description: z.string().optional(),
        days: z.number(),
        schedule: z.array(dayScheduleSchema),
      }).safeParse(programData);

      if (!programResult.success) {
        console.error('[AI Personalized Program] Validation error:', programResult.error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Invalid program structure from AI',
        });
      }

      console.log('[AI Personalized Program] Successfully generated program:', programResult.data.title);

      return {
        ...programResult.data,
        userId,
        isAiGenerated: true,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[AI Personalized Program] Unexpected error:', error);
      
      if (error instanceof TRPCError) {
        throw error;
      }
      
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate personalized program',
      });
    }
  });

export default generatePersonalizedProgramRoute;
