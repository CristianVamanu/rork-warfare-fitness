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
    const apiKey = input.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "OpenAI API key is required. Set OPENAI_API_KEY or provide it in Admin Settings.",
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
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
                image_url: { url: `data:image/jpeg;base64,${input.base64Image}`, detail: "low" },
              },
            ],
          },
        ],
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `OpenAI error: ${response.status} - ${err.substring(0, 100)}`,
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No response from OpenAI" });
    }

    const parsed = JSON.parse(content);

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
      // Try to salvage partial data before giving up
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
