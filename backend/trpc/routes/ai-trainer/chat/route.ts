import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { TRPCError } from "@trpc/server";

const SYSTEM_PROMPT = `You are an elite AI fitness coach for Warfare Fitness — a premium military-inspired fitness app. Your name is "Commander AI".

Your personality: Motivational, direct, knowledgeable, slightly military in tone but approachable. Think of a tough-love personal trainer who genuinely cares.

You provide:
- Personalized workout advice based on user's stats and goals
- Nutrition guidance (macros, meal timing, supplements)
- Recovery tips (sleep, cold therapy, stretching)
- Mental toughness and motivation
- Form corrections and exercise alternatives
- Progress tracking advice

Rules:
- Always remind users to consult a doctor before starting new exercise routines if they have health conditions
- Never diagnose medical conditions
- Keep responses concise and actionable
- Use military metaphors occasionally ("mission", "soldier", "deploy", "execute")
- End responses with a motivational one-liner when appropriate`;

export const aiTrainerChatRoute = publicProcedure
  .input(z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })),
    userContext: z.object({
      age: z.string().optional(),
      height: z.string().optional(),
      weight: z.string().optional(),
      goal: z.string().optional(),
      experience: z.string().optional(),
      role: z.string().optional(),
    }).optional(),
    apiKey: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const apiKey = (input.apiKey ?? '').trim() || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No OpenAI API key set. Go to Admin → Settings and paste your key in the AI API Key field, then tap Save.',
      });
    }

    const contextNote = input.userContext
      ? `\n\nUser Profile: Age ${input.userContext.age || 'unknown'}, Height ${input.userContext.height || 'unknown'}, Weight ${input.userContext.weight || 'unknown'}, Goal: ${input.userContext.goal || 'general fitness'}, Experience: ${input.userContext.experience || 'unknown'}`
      : '';

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT + contextNote },
            ...input.messages,
          ],
          max_tokens: 500,
          temperature: 0.8,
        }),
      });
      clearTimeout(timeout);
    } catch (fetchErr: any) {
      if (fetchErr?.name === 'AbortError') {
        throw new TRPCError({ code: 'TIMEOUT', message: 'OpenAI took too long to respond. Try again.' });
      }
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Network error reaching OpenAI: ${fetchErr?.message}` });
    }

    const rawText = await response.text();

    if (!response.ok) {
      let hint = '';
      if (response.status === 401) hint = ' — API key is invalid or expired.';
      else if (response.status === 429) hint = ' — Rate limit hit. Wait a moment and try again.';
      else if (response.status === 400) hint = ' — Bad request. Check your API key.';
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `OpenAI error ${response.status}${hint} ${rawText.substring(0, 120)}`,
      });
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'OpenAI returned an unreadable response. Try again.' });
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'OpenAI returned no content. Try again.' });
    }
    return { message: content };
  });

export default aiTrainerChatRoute;
