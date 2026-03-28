import { z } from 'zod';
import { protectedProcedure } from '../../../create-context';

const weightClassSchema = z.object({
  className: z.string(),
  targetValue: z.number(),
});

export const updateChallengeRoute = protectedProcedure
  .input(
    z.object({
      challengeId: z.string(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      mediaUrl: z.string().optional(),
      metricType: z.string().optional(),
      unit: z.string().optional(),
      weightClasses: z.array(weightClassSchema).optional(),
      rewardLink: z.string().url().optional(),
      verificationType: z.enum(['manual', 'video']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    console.log('[Challenge] Updated challenge:', input.challengeId);
    return { success: true };
  });
