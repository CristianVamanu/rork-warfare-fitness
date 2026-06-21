import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { TRPCError } from "@trpc/server";

export const scanFoodRoute = publicProcedure
  .input(
    z.object({
      base64Image: z.string(),
      apiKey: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const apiKey = (input.apiKey ?? '').trim() || process.env.OPENAI_API_KEY;

    // Strip data URL prefix if present (expo-image-picker on web may include it)
    const base64 = input.base64Image.replace(/^data:[^;]+;base64,/, '');

    if (!apiKey) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No OpenAI API key set. Go to Admin → Settings and paste your key in the AI API Key field, then tap Save.",
      });
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: 'Identify the food in this image and estimate nutritional content per serving. Return ONLY a raw JSON object (no markdown, no code blocks) with exactly these keys and numeric values: {"name":"string","calories":0,"protein":0,"carbs":0,"fat":0}. All nutritional values must be plain integers or decimals, not strings.',
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "low" },
                },
              ],
            },
          ],
          max_tokens: 200,
          response_format: { type: "json_object" },
        }),
      });
      clearTimeout(timeout);
    } catch (fetchErr: any) {
      if (fetchErr?.name === 'AbortError') {
        throw new TRPCError({ code: 'TIMEOUT', message: 'OpenAI took too long to respond. Try again.' });
      }
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Network error: ${fetchErr?.message}` });
    }

    const rawText = await response.text();

    if (!response.ok) {
      let hint = '';
      if (response.status === 401) hint = ' — API key is invalid or expired.';
      else if (response.status === 429) hint = ' — Rate limit hit. Wait a moment and try again.';
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `OpenAI error ${response.status}${hint}`,
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
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No response from OpenAI" });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not parse food data from AI response.' });
    }

    const result = z
      .object({
        name: z.string(),
        calories: z.coerce.number(),
        protein: z.coerce.number(),
        carbs: z.coerce.number(),
        fat: z.coerce.number(),
      })
      .safeParse(parsed);

    if (!result.success) {
      return {
        name: parsed?.name ?? parsed?.food_name ?? 'Unknown food',
        calories: Number(parsed?.calories ?? parsed?.kcal ?? 0),
        protein: Number(parsed?.protein ?? parsed?.protein_g ?? 0),
        carbs: Number(parsed?.carbs ?? parsed?.carbohydrates ?? parsed?.carbs_g ?? 0),
        fat: Number(parsed?.fat ?? parsed?.fat_g ?? 0),
      };
    }

    return result.data;
  });

export default scanFoodRoute;
