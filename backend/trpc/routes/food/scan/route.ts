import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { TRPCError } from "@trpc/server";

const nutritionSchema = z.object({
  name: z.string(),
  calories: z.coerce.number(),
  protein: z.coerce.number(),
  carbs: z.coerce.number(),
  fat: z.coerce.number(),
  fiber: z.coerce.number().optional(),
  portionSize: z.string().optional(),
  confidenceScore: z.coerce.number().min(0).max(1).optional(),
});

type NutritionResult = z.infer<typeof nutritionSchema>;

async function callOpenAI(apiKey: string, messages: any[]): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });
  } catch (fetchErr: any) {
    clearTimeout(timeout);
    if (fetchErr?.name === "AbortError") {
      throw new TRPCError({ code: "TIMEOUT", message: "OpenAI took too long to respond. Try again." });
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Network error: ${fetchErr?.message}` });
  }
  clearTimeout(timeout);

  const rawText = await response.text();

  if (!response.ok) {
    let hint = "";
    if (response.status === 401) hint = " — API key is invalid or expired.";
    else if (response.status === 429) hint = " — Rate limit hit. Wait a moment and try again.";
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `OpenAI error ${response.status}${hint}` });
  }

  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OpenAI returned an unreadable response. Try again." });
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No response from OpenAI" });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not parse food data from AI response." });
  }

  return parsed;
}

function normalizeNutrition(parsed: any): NutritionResult {
  const result = nutritionSchema.safeParse(parsed);
  if (result.success) return result.data;

  return {
    name: parsed?.name ?? parsed?.food_name ?? "Unknown food",
    calories: Number(parsed?.calories ?? parsed?.kcal ?? 0),
    protein: Number(parsed?.protein ?? parsed?.protein_g ?? 0),
    carbs: Number(parsed?.carbs ?? parsed?.carbohydrates ?? parsed?.carbs_g ?? 0),
    fat: Number(parsed?.fat ?? parsed?.fat_g ?? 0),
    fiber: parsed?.fiber != null ? Number(parsed.fiber) : undefined,
    portionSize: parsed?.portionSize ?? parsed?.portion_size ?? undefined,
    confidenceScore: parsed?.confidenceScore ?? parsed?.confidence ?? undefined,
  };
}

export const scanFoodRoute = publicProcedure
  .input(
    z.object({
      base64Image: z.string().optional(),
      barcodeId: z.string().optional(),
      apiKey: z.string().optional(),
    }).refine((d) => d.base64Image || d.barcodeId, {
      message: "Provide either base64Image or barcodeId",
    })
  )
  .mutation(async ({ input }) => {
    const apiKey = (input.apiKey ?? "").trim() || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No OpenAI API key set. Go to Admin → Settings and paste your key in the AI API Key field, then tap Save.",
      });
    }

    // Barcode text-based lookup (no image required)
    if (input.barcodeId) {
      const messages = [
        {
          role: "user",
          content: `Look up the food product with barcode "${input.barcodeId}" and provide its nutritional information per standard serving. Return ONLY a raw JSON object with these keys: {"name":"string","calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"portionSize":"string","confidenceScore":0.0}. All numeric values must be numbers not strings. confidenceScore must be between 0 and 1. If you don't recognise the barcode, set name to "Unknown product" and all numbers to 0 with confidenceScore 0.`,
        },
      ];
      const parsed = await callOpenAI(apiKey, messages);
      return normalizeNutrition(parsed);
    }

    // Image-based food analysis
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: 'Identify the food in this image and estimate its nutritional content per serving. Return ONLY a raw JSON object (no markdown, no code blocks) with exactly these keys: {"name":"string","calories":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"portionSize":"string","confidenceScore":0.0}. All nutritional values must be plain numbers. portionSize should be a human-readable estimate like "1 cup (240g)". confidenceScore between 0 and 1 reflects how confident you are.',
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${input.base64Image}`, detail: "low" },
          },
        ],
      },
    ];

    const parsed = await callOpenAI(apiKey, messages);
    return normalizeNutrition(parsed);
  });

export default scanFoodRoute;
