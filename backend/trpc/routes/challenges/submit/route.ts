import { z } from 'zod';
import { protectedProcedure } from '../../../create-context';

export const submitChallengeRoute = protectedProcedure
  .input(
    z.object({
      challengeId: z.string(),
      weightClass: z.string(),
      resultValue: z.number(),
      proofUrl: z.string().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const submission = {
      id: 's-' + Date.now().toString(),
      userId: ctx.userId,
      challengeId: input.challengeId,
      weightClass: input.weightClass,
      resultValue: input.resultValue,
      proofUrl: input.proofUrl,
      isVerified: true,
      rewardUnlocked: false,
      timestamp: new Date().toISOString(),
    };

    console.log('[Challenge] Submission created:', submission.id);
    return submission;
  });
