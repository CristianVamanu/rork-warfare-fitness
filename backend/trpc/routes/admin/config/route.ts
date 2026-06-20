import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getSettings, updateSettings } from "../../../../settings-store";

export const getAdminConfigRoute = publicProcedure.query(() => {
  const s = getSettings();
  return {
    hasServerApiKey: !!s.aiApiKey,
    ...s,
    // Never expose the raw API key to non-admin clients — just the presence flag
    aiApiKey: undefined,
  };
});

export const saveAdminSettingsRoute = publicProcedure
  .input(z.object({
    aiApiKey: z.string().optional(),
    stripePaymentLink: z.string().optional(),
    monthlyPrice: z.string().optional(),
    appName: z.string().optional(),
    tagline: z.string().optional(),
    supportEmail: z.string().optional(),
    welcomeMessage: z.string().optional(),
    dailyMessage: z.string().optional(),
    heroTitle: z.string().optional(),
    heroSubtitle: z.string().optional(),
    coffeeLink: z.string().optional(),
  }))
  .mutation(({ input }) => {
    const updates: Record<string, string> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) updates[k] = v;
    }
    return updateSettings(updates);
  });

export const getAdminSecretsRoute = publicProcedure.query(() => {
  // Returns the full settings including API key — only call from admin UI
  return getSettings();
});
