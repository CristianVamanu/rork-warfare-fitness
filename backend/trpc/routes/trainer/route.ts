import { z } from 'zod';
import { publicProcedure } from '../../create-context';

// In-memory trainer registry — maps inviteCode → trainerId
const trainerCodes: Record<string, { trainerId: string; trainerName: string }> = {};
// Maps trainerId → clientIds
const trainerClients: Record<string, string[]> = {};

export const registerTrainerCodeRoute = publicProcedure
  .input(z.object({ trainerId: z.string(), trainerName: z.string(), inviteCode: z.string() }))
  .mutation(({ input }) => {
    trainerCodes[input.inviteCode] = { trainerId: input.trainerId, trainerName: input.trainerName };
    return { success: true, inviteCode: input.inviteCode };
  });

export const resolveInviteCodeRoute = publicProcedure
  .input(z.object({ inviteCode: z.string() }))
  .query(({ input }) => {
    const entry = trainerCodes[input.inviteCode.toUpperCase()];
    if (!entry) return null;
    return entry;
  });

export const linkClientRoute = publicProcedure
  .input(z.object({ trainerId: z.string(), clientId: z.string() }))
  .mutation(({ input }) => {
    if (!trainerClients[input.trainerId]) trainerClients[input.trainerId] = [];
    if (!trainerClients[input.trainerId].includes(input.clientId)) {
      trainerClients[input.trainerId].push(input.clientId);
    }
    return { success: true };
  });

export const getClientsRoute = publicProcedure
  .input(z.object({ trainerId: z.string() }))
  .query(({ input }) => {
    return trainerClients[input.trainerId] ?? [];
  });
