import { z } from 'zod';
import { publicProcedure } from '../../../create-context';

export const listChallengesRoute = publicProcedure
  .input(
    z.object({
      status: z.enum(['active', 'incoming', 'ended', 'all']).optional(),
    }).optional()
  )
  .query(async ({ input }) => {
    console.log('[Challenge] Listing challenges with filter:', input?.status);
    return [];
  });
