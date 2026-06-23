import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { createHmac, timingSafeEqual } from "crypto";

const app = new Hono();

app.use("*", cors());

app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
  })
);

app.get("/api/health", async (c) => {
  const openAiKey = process.env.OPENAI_API_KEY;

  // Verify OpenAI key actually works with a cheap models/list call
  let openAiStatus = "not configured";
  let openAiError = null;
  if (openAiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${openAiKey}` },
      });
      openAiStatus = res.ok ? "ok" : `error ${res.status}`;
      if (!res.ok) openAiError = await res.text().then(t => t.substring(0, 100));
    } catch (e: any) {
      openAiStatus = "unreachable";
      openAiError = e?.message;
    }
  }

  // ── Server-side Firebase env diagnostic ──────────────────────────────────
  const fbServerDiag = {
    NEXT_PUBLIC_FIREBASE_API_KEY:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ? '✓ set' : '✗ MISSING',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ? '✓ set' : '✗ MISSING',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ? '✓ set' : '✗ MISSING',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ? '✓ set' : '✗ MISSING (optional)',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ? '✓ set' : '✗ MISSING (optional)',
    NEXT_PUBLIC_FIREBASE_APP_ID:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ? '✓ set' : '✗ MISSING',
  };
  // Log all env var keys that contain FIREBASE so we can see if they exist under a different name
  const allFirebaseKeys = Object.keys(process.env).filter(k => k.includes('FIREBASE'));
  console.log('[Health] Server-side FIREBASE env keys found:', allFirebaseKeys);
  console.log('[Health] Server-side Firebase diagnostic:', fbServerDiag);
  // ─────────────────────────────────────────────────────────────────────────

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    env: {
      OPENAI_API_KEY: openAiKey ? `set (sk-...${openAiKey.slice(-4)})` : "MISSING",
      EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || "not set (using relative)",
    },
    firebase: fbServerDiag,
    firebaseKeysFoundInProcessEnv: allFirebaseKeys,
    checks: {
      openAi: openAiStatus,
      ...(openAiError ? { openAiError } : {}),
    },
  });
});

// ─── Stripe webhook ───────────────────────────────────────────────────────────
// Stores subscription data in Firestore after a successful Stripe payment.
// Stripe dashboard → Webhooks → add endpoint: https://<your-domain>/api/stripe/webhook
// Events to listen for: customer.subscription.created/updated/deleted
app.post("/api/stripe/webhook", async (c) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  const rawBody = await c.req.text();
  const sigHeader = c.req.header("stripe-signature") ?? "";

  // Parse t= and v1= from the Stripe-Signature header
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=") as [string, string])
  );
  const timestamp = parts["t"];
  const v1Sig = parts["v1"];

  if (!timestamp || !v1Sig) {
    return c.json({ error: "Invalid signature header" }, 400);
  }

  // Verify HMAC-SHA256 signature
  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(v1Sig, "hex");

  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    console.error("[Webhook] Signature mismatch");
    return c.json({ error: "Signature verification failed" }, 400);
  }

  // Replay protection: reject events older than 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return c.json({ error: "Timestamp too old" }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  console.log(`[Webhook] Processing event: ${event.type}`);

  try {
    const { getAdminFirestore } = await import("./firebase-admin");
    const db = getAdminFirestore();

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const sub = event.data.object;
      // client_reference_id is set when the user opens the Payment Link via paywall.tsx
      const userId: string | undefined =
        sub.metadata?.user_id ||
        event.data.object.client_reference_id ||
        undefined;

      if (!userId) {
        console.warn("[Webhook] No user_id in metadata or client_reference_id — cannot link subscription");
        return c.json({ received: true, warning: "no user_id" });
      }

      const priceId: string = sub.items?.data?.[0]?.price?.id ?? "";
      const isActive = sub.status === "active" || sub.status === "trialing";

      await db.collection("subscriptions").doc(userId).set(
        {
          userId,
          stripeCustomerId: sub.customer ?? null,
          stripeSubscriptionId: sub.id ?? null,
          stripePriceId: priceId,
          status: sub.status ?? "unknown",
          isPremium: isActive,
          currentPeriodStart: sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          trialStart: sub.trial_start
            ? new Date(sub.trial_start * 1000).toISOString()
            : null,
          trialEnd: sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      console.log(`[Webhook] Saved subscription for user ${userId}`);
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const userId: string | undefined = sub.metadata?.user_id || undefined;

      if (userId) {
        await db.collection("subscriptions").doc(userId).set(
          {
            status: "canceled",
            isPremium: false,
            cancelAtPeriodEnd: false,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        console.log(`[Webhook] Canceled subscription for user ${userId}`);
      }
    } else {
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error("[Webhook] Firestore write failed:", err);
    return c.json({ error: "Database write failed" }, 500);
  }

  return c.json({ received: true });
});

app.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running" });
});

export default app;
