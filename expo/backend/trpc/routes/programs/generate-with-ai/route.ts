import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { TRPCError } from "@trpc/server";

const exerciseSchema = z.object({
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
  restSec: z.number(),
  rpe: z.string().optional(),
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

export const generateProgramWithAiRoute = publicProcedure
  .input(
    z.object({
      programDescription: z.string(),
      apiKey: z.string(),
      days: z.number().optional().default(90),
    })
  )
  .mutation(async ({ input }) => {
    try {
      console.log('[AI Program Gen] Starting generation with description:', input.programDescription);

      const { programDescription, apiKey, days } = input;

      if (!apiKey || apiKey.trim().length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'OpenAI API key is required. Please set it in Admin Settings.',
        });
      }

    const systemPrompt = `You are a professional fitness program designer. Generate a complete ${days}-day workout program based on the user's description.

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, no extra text.

The JSON must follow this exact structure:
{
  "title": "Program Title",
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
            "rpe": "7-9"
          }
        ]
      }
    }
  ]
}

For rest days, use: { "day": X, "workout": null }

Include proper progression, variety, rest days, and follow exercise science principles.`;

    const requestBody = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Create a ${days}-day workout program: ${programDescription}`,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    };

    console.log('[AI Program Gen] Calling OpenAI API...');

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
        console.error('[AI Program Gen] OpenAI API error:', response.status, errorText);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `OpenAI API error: ${response.status} - ${errorText.substring(0, 100)}`,
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

      console.log('[AI Program Gen] Received response from OpenAI');
      console.log('[AI Program Gen] Raw content:', content.substring(0, 200));

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
        
        console.log('[AI Program Gen] Cleaned content:', cleanContent.substring(0, 200));
        programData = JSON.parse(cleanContent);
      } catch (parseError) {
        console.error('[AI Program Gen] Failed to parse JSON:', content);
        console.error('[AI Program Gen] Parse error:', parseError);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Invalid JSON response from OpenAI: ' + (parseError instanceof Error ? parseError.message : 'Unknown error'),
        });
      }

      const programResult = z.object({
        title: z.string(),
        days: z.number(),
        schedule: z.array(dayScheduleSchema),
      }).safeParse(programData);

      if (!programResult.success) {
        console.error('[AI Program Gen] Validation error:', programResult.error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Invalid program structure from AI: ' + programResult.error.message,
        });
      }

      console.log('[AI Program Gen] Successfully generated program:', programResult.data.title);

      return programResult.data;
    } catch (error) {
      console.error('[AI Program Gen] Unexpected error:', error);
      
      if (error instanceof TRPCError) {
        throw error;
      }
      
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error instanceof Error ? error.message : 'An unexpected error occurred while generating the program',
      });
    }
  });

export default generateProgramWithAiRoute;
