import { z } from 'zod';
import { protectedProcedure } from '../../../create-context';

export const getUserSubmissionsRoute = protectedProcedure
  .input(
    z.object({
      challengeId: z.string().optional(),
    }).optional()
  )
  .query(async ({ input, ctx }) => {
    console.log('[Challenge] Getting user submissions for:', ctx.userId);
    return [];
  });
