import { z } from 'zod';
import { protectedProcedure } from '../../../create-context';

export const deleteChallengeRoute = protectedProcedure
  .input(
    z.object({
      challengeId: z.string(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    console.log('[Challenge] Deleted challenge:', input.challengeId);
    return { success: true };
  });
