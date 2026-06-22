import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { TRPCError } from "@trpc/server";

export const getSubscriptionStatusRoute = publicProcedure
  .input(z.object({ userId: z.string().min(1) }))
  .query(async ({ input }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      // Supabase not configured — return null so client falls back to local cache
      return null;
    }

    let response: Response;
    try {
      response = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(input.userId)}&order=created_at.desc&limit=1`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (err: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to reach Supabase: ${err?.message}` });
    }

    if (!response.ok) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Supabase error ${response.status}` });
    }

    const rows: any[] = await response.json();
    if (!rows.length) return null;

    const sub = rows[0];
    const isActive = sub.status === "active" || sub.status === "trialing";
    const isInTrial = sub.status === "trialing";
    const periodEnd: string | null = sub.current_period_end ?? null;
    const trialEnd: string | null = sub.trial_end ?? null;

    return {
      isPremium: isActive,
      isActive,
      status: sub.status as string,
      expirationDate: periodEnd,
      willRenew: !(sub.cancel_at_period_end ?? false),
      productIdentifier: sub.stripe_price_id as string | null,
      isInTrialPeriod: isInTrial,
      trialEndDate: isInTrial ? trialEnd : null,
      stripeCustomerId: sub.stripe_customer_id as string | null,
      stripeSubscriptionId: sub.stripe_subscription_id as string | null,
    };
  });
