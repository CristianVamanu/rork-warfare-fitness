import { z } from "zod";
import { publicProcedure } from "@/backend/trpc/create-context";

export const deleteShopProductProcedure = publicProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ input }) => {
    console.log("[Shop] Deleting product:", input.id);
    return {
      success: true,
    };
  });
