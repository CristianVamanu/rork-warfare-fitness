import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

export const getChallengeRoute = publicProcedure
  .input(
    z.object({
      challengeId: z.string(),
    })
  )
  .query(async ({ input }) => {
    console.log('[Challenge] Getting challenge:', input.challengeId);
    return null;
  });
