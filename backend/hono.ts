import { Hono } from "hono";
import { handle } from "hono/vercel";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";

export const config = { runtime: "edge" };

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

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      OPENAI_API_KEY: openAiKey ? `set (sk-...${openAiKey.slice(-4)})` : "MISSING",
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "MISSING",
      EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ? "set" : "MISSING",
      EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || "not set (using relative)",
    },
    checks: {
      openAi: openAiStatus,
      ...(openAiError ? { openAiError } : {}),
    },
  });
});

app.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running" });
});

export default handle(app);
