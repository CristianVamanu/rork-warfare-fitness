import { z } from 'zod';
import { protectedProcedure } from '../../../create-context';

const weightClassSchema = z.object({
  className: z.string(),
  targetValue: z.number(),
});

export const createChallengeRoute = protectedProcedure
  .input(
    z.object({
      title: z.string().min(1),
      description: z.string(),
      mediaUrl: z.string().optional(),
      metricType: z.string(),
      unit: z.string(),
      weightClasses: z.array(weightClassSchema),
      rewardLink: z.string().url(),
      verificationType: z.enum(['manual', 'video']),
      startDate: z.string(),
      endDate: z.string(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const challenge = {
      id: 'c-' + Date.now().toString(),
      ...input,
      createdBy: ctx.user.id,
      createdAt: new Date().toISOString(),
    };

    console.log('[Challenge] Created challenge:', challenge.id);
    return challenge;
  });
