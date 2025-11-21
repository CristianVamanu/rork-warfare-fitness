import { z } from "zod";
import { publicProcedure } from "@/backend/trpc/create-context";

export const updateShopProductProcedure = publicProcedure
  .input(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      photoUrl: z.string().optional(),
      affiliateLink: z.string().optional(),
      price: z.string().optional(),
      category: z.string().optional(),
      order: z.number().optional(),
      isActive: z.boolean().optional(),
    })
  )
  .mutation(async ({ input }) => {
    console.log("[Shop] Updating product:", input.id);
    return {
      success: true,
    };
  });
