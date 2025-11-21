import { z } from "zod";
import { publicProcedure } from "@/backend/trpc/create-context";

export const createShopProductProcedure = publicProcedure
  .input(
    z.object({
      title: z.string(),
      description: z.string(),
      photoUrl: z.string(),
      affiliateLink: z.string(),
      price: z.string().optional(),
      category: z.string().optional(),
      order: z.number(),
      isActive: z.boolean(),
    })
  )
  .mutation(async ({ input }) => {
    console.log("[Shop] Creating product:", input.title);
    return {
      success: true,
      product: {
        id: Date.now().toString(),
        ...input,
        createdAt: new Date().toISOString(),
      },
    };
  });
