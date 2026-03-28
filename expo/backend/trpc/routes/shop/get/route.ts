import { z } from "zod";
import { publicProcedure } from "@/backend/trpc/create-context";

export const getShopProductProcedure = publicProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input }) => {
    console.log("[Shop] Getting product:", input.id);
    return {
      success: true,
      product: null,
    };
  });
